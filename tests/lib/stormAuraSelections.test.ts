import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { deriveCharacterActions, deriveRulesTextActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  resolveClassChoiceOptions,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelectionGrants,
  reconcileClassChoiceSelections,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { summarizeFeatureOptionSelection } from '@/lib/character/featureOptionSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import {
  deriveStormAuraEffects,
  getStormAuraSelectionStates,
} from '@/lib/character/stormAuraSelections'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeStormAuraFixture, selectStormAura } from '../fixtures/stormAuraFixtures'
import { installStormSourceDouble } from '../fixtures/stormAuraSourceDouble'

beforeEach(installStormSourceDouble)
afterEach(() => vi.restoreAllMocks())

type Fixture = ReturnType<typeof makeStormAuraFixture>
const state = (saved: Character, f: Fixture) =>
  getStormAuraSelectionStates(saved, f.data.classes, f.catalogs)[0]
const calc = (saved: Character, f: Fixture) =>
  createCharacterCalculationContext(saved, {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  })
const actions = (saved: Character, f: Fixture) =>
  deriveRulesTextActions(saved, undefined, {
    classes: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }).filter((row) => row.source.kind === 'subclass')
const stormIssues = (saved: Character, f: Fixture) =>
  validateClassChoices(saved, calc(saved, f), f.catalogs).filter((row) =>
    /Storm Aura|Storm Soul|Raging Storm|Shielding Storm/.test(row.title + row.explanation),
  )

describe('source-backed Storm Aura', () => {
  test.each([
    'PHB',
    'XPHB',
  ])('actual %s owner selects the original PHB target, saves and preserves semantic no-op', (source) => {
    const f = makeStormAuraFixture(3, source)
    expect(f.choice?.options.map((row) => row.ref)).toEqual([
      'Desert|Barbarian|PHB|Storm Herald|XGE|3|XGE',
      'Sea|Barbarian|PHB|Storm Herald|XGE|3|XGE',
      'Tundra|Barbarian|PHB|Storm Herald|XGE|3|XGE',
    ])
    expect(stormIssues(f.character, f).some((row) => row.title === 'Finish Storm Aura')).toBe(true)
    const saved = selectStormAura(f)
    const selection = saved.classChoiceSelections![0]
    expect(selection).toMatchObject({
      kind: 'subclass-feature',
      classSource: source,
      classLevel: 3,
      selected: [
        {
          name: 'Sea',
          source: 'XGE',
          ref: 'Sea|Barbarian|PHB|Storm Herald|XGE|3|XGE',
          slotLevel: 3,
        },
      ],
    })
    selection.selected[0].ref = ' sea | Barbarian | PHB | Storm Herald | XGE | 3'
    selection.selected[0].name = ' Sea '
    const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
    const result = applyClassChoiceSelectionWithGrantsCommand(
      reopened,
      reopened.provenance!,
      f.choice!,
      [f.choice!.options[1]],
    )
    expect(result.characterPatch).toEqual({})
    expect(result.provenanceUpdate).toBe(reopened.provenance)
    expect(stormIssues(reopened, f)).toEqual([])
    expect(state(reopened, f).storm?.stages.map((row) => row.name)).toEqual(['Storm Aura'])
  })
  test.each([
    'Desert',
    'Sea',
    'Tundra',
  ])('one %s environment governs earned stages and action kinds', (name) => {
    const f = makeStormAuraFixture(14)
    const saved = selectStormAura(f, name)
    const current = state(saved, f)
    expect(current.storm?.stages.map((row) => [row.name, row.available])).toEqual([
      ['Storm Aura', true],
      ['Storm Soul', true],
      ['Shielding Storm', true],
      ['Raging Storm', true],
    ])
    expect(actions(saved, f).map((row) => [row.name, row.kind])).toEqual(
      name === 'Sea'
        ? [
            ['Storm Aura — Sea', 'bonus-action'],
            ['Raging Storm — Sea', 'reaction'],
          ]
        : name === 'Desert'
          ? [
              ['Storm Aura — Desert', 'bonus-action'],
              ['Storm Soul — Desert', 'action'],
              ['Raging Storm — Desert', 'reaction'],
            ]
          : [
              ['Storm Aura — Tundra', 'bonus-action'],
              ['Storm Soul — Tundra', 'action'],
            ],
    )
    expect(
      deriveStormAuraEffects([current])
        .filter((row) => row.target.kind === 'damage-resistance')
        .map((row) => row.target),
    ).toEqual([
      {
        kind: 'damage-resistance',
        damageType: name === 'Desert' ? 'fire' : name === 'Sea' ? 'lightning' : 'cold',
      },
    ])
    const aura3 = makeStormAuraFixture(3)
    const aura3saved = selectStormAura(aura3, name)
    expect(actions(saved, f)[0].id).toBe(actions(aura3saved, aura3)[0].id)
    if (name === 'Tundra')
      expect(actions(saved, f)[0].description).toContain('speed is reduced to 0')
    expect(stormIssues(saved, f)).toEqual([])
  })
  test.each([
    'PHB',
    'XPHB',
  ])('current %s picker authority requires both intro and Aura even with available children', (source) => {
    const f = makeStormAuraFixture(3, source)
    const saved = selectStormAura(f)
    const scoped = scopeClassChoiceFeatureCatalogs(
      f.catalogs,
      getFeatureOwnerKey('Barbarian', source, 'Path of the Storm Herald', 'XGE'),
    )
    for (const name of ['Path of the Storm Herald', 'Storm Aura']) {
      const missing = {
        ...f.catalogs,
        ...scoped,
        subclassTargets: undefined,
        subclassFeatures: scoped.subclassFeatures.filter((feature) => feature.name !== name),
        subclassFeatureCandidates: new Map(
          [...scoped.subclassFeatureCandidates!].filter(([, rows]) =>
            rows.every((feature) => feature.name !== name),
          ),
        ),
      }
      expect(
        resolveClassChoiceOptions(f.choice!, missing, [], 3).every(
          (option) => option.availability === 'retained',
        ),
      ).toBe(true)
      expect(
        resolveClassChoiceOptions(
          f.choice!,
          missing,
          saved.classChoiceSelections![0].selected,
          3,
        ).every((option) => option.availability === 'retained'),
      ).toBe(true)
      const changed = { ...f, catalogs: missing }
      expect(state(saved, changed).recovery).toBe(true)
    }
    expect(
      resolveClassChoiceOptions(f.choice!, f.catalogs, [], 3).map((option) => option.availability),
    ).toEqual(['eligible', 'eligible', 'eligible'])
  })
  test('absent feature authority cannot be replenished from embedded classes in calculation or PDF', () => {
    const fixture = makeStormAuraFixture(6)
    const saved = selectStormAura(fixture)
    const input = {
      ...fixture.data.lookups!,
      classChoiceClasses: fixture.data.classes,
      classChoiceFeatureCatalogs: undefined,
    }
    const calculation = createCharacterCalculationContext(saved, input)
    expect(
      calculation.effects.sourceDeclarations.some(
        (effect) => effect.target.kind === 'damage-resistance',
      ),
    ).toBe(false)
    expect(calculation.movement.speeds.swim).toBeUndefined()
    const vm = createCharacterSheetViewModel(saved, input)
    expect(vm.actions.some((action) => action.name === 'Storm Aura — Sea')).toBe(false)
    expect(vm.featuresSummary).toContain('rules unavailable')
    expect(vm.movement.speeds.swim).toBeUndefined()
  })
  test('Sea Soul derives resistance and swim without overwriting faster or manual movement', () => {
    const f = makeStormAuraFixture(6)
    const saved = selectStormAura(f)
    expect(calc(saved, f).movement.speeds.swim).toBe(30)
    saved.movement.speeds.swim = 45
    expect(calc(saved, f).movement.speeds.swim).toBe(45)
    saved.movementOverrides = { swim: 15 }
    expect(calc(saved, f).movement.speeds.swim).toBe(15)
    const original = JSON.stringify(saved)
    const empty = {
      ...f.catalogs,
      subclassFeatures: [],
      subclassFeatureCandidates: new Map(),
      subclassTargets: undefined,
    }
    const missing = createCharacterCalculationContext(
      saved,
      { ...f.data.lookups!, classChoiceClasses: f.data.classes, classChoiceFeatureCatalogs: empty },
      f.data.lookups!,
    )
    expect(
      missing.effects.sourceDeclarations.some((row) => row.target.kind === 'damage-resistance'),
    ).toBe(false)
    expect(JSON.stringify(saved)).toBe(original)
    const filtered = createCharacterCalculationContext(
      saved,
      { classesByKey: {}, classChoiceClasses: [], classChoiceFeatureCatalogs: empty },
      f.data.lookups!,
    )
    expect(
      filtered.effects.sourceDeclarations.some((row) => row.target.kind === 'damage-resistance'),
    ).toBe(false)
  })
  test.each([
    'Storm Soul',
    'Shielding Storm',
    'Raging Storm',
  ])('missing earned %s retracts only dependent stages and restores exactly', (name) => {
    const f = makeStormAuraFixture(14)
    const saved = selectStormAura(f)
    const missing = makeStormAuraFixture(14, 'PHB', (doc) => {
      doc.subclassFeature = doc.subclassFeature.filter((row) => row.name !== name)
    })
    const current = state(saved, missing)
    expect(current.recovery).toBe(false)
    expect(current.storm?.stages.find((row) => row.name === 'Storm Aura')?.available).toBe(true)
    expect(current.storm?.stages.find((row) => row.name === name)?.available).toBe(false)
    expect(
      stormIssues(saved, missing).some((row) => row.title === 'Restore Storm Aura dependent rules'),
    ).toBe(true)
    expect(summarizeFeatureOptionSelection(current, false)).toContain(`${name} (rules unavailable)`)
    expect(state(saved, f).storm?.stages.every((row) => row.available)).toBe(true)
  })
  test('wholly pruned declaration retains strict intent and only keep/remove recovery is allowed', () => {
    const f = makeStormAuraFixture()
    const saved = selectStormAura(f)
    const missing = makeStormAuraFixture(3, 'PHB', (doc) => {
      doc.subclassFeature = doc.subclassFeature.filter((row) => row.name !== 'Storm Aura')
      doc.subclassFeature.find((row) => row.name === 'Path of the Storm Herald')!.entries = []
    })
    expect(state(saved, missing).recovery).toBe(true)
    const keys = state(saved, missing)
      .options.map((row) => row.reference)
      .map((row) => row.ref!)
    expect(keys).toEqual(['Sea|Barbarian|PHB|Storm Herald|XGE|3|XGE'])
    expect(() =>
      retainSavedFeatureOptionsCommand(saved, saved.provenance!, f.choice!.id, ['invented']),
    ).toThrow()
    const original = JSON.stringify(saved)
    const kept = retainSavedFeatureOptionsCommand(saved, saved.provenance!, f.choice!.id, [
      getKey(),
    ])
    expect(kept.characterPatch).toEqual({})
    expect(JSON.stringify(saved)).toBe(original)
    const clear = retainSavedFeatureOptionsCommand(saved, saved.provenance!, f.choice!.id, [])
    expect(clear.characterPatch.classChoiceSelections).toEqual([])
    expect(clear.characterPatch.features).toEqual(f.character.features)
    expect(state(saved, f).recovery).toBe(false)
  })
  test.each([
    'name',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
    'source',
  ])('a sole wrong %s child cannot satisfy the complete target', (field) => {
    const f = makeStormAuraFixture(6)
    const saved = selectStormAura(f)
    const changed = makeStormAuraFixture(6, 'PHB', (doc) => {
      const row = doc.subclassFeature.find((row) => row.name === 'Sea' && row.level === 3)!
      Object.assign(row, { [field]: field === 'level' ? 4 : 'Wrong' })
    })
    expect(state(saved, changed).details[0].available).toBe(false)
    expect(actions(saved, changed)).toEqual([])
    expect(deriveStormAuraEffects([state(saved, changed)])).toEqual([])
    expect(state(saved, f).details[0].available).toBe(true)
  })
  test.each([
    'Path of the Storm Herald',
    'Storm Aura',
    'Sea',
  ])('raw conflicting duplicate %s is audited before first-match enrichment', (name) => {
    const f = makeStormAuraFixture(6)
    const saved = selectStormAura(f)
    const conflict = makeStormAuraFixture(6, 'PHB', (doc) => {
      const row = doc.subclassFeature.find((row) => row.name === name && row.level === 3)!
      doc.subclassFeature.push({ ...row, entries: ['Conflicting producer.'] })
    })
    expect(state(saved, conflict).details[0].available).toBe(false)
    expect(actions(saved, conflict)).toEqual([])
  })
  test('later malformed fixed primitive is unavailable while Aura remains verified', () => {
    const f = makeStormAuraFixture(6)
    const saved = selectStormAura(f)
    const changed = makeStormAuraFixture(6, 'PHB', (doc) => {
      doc.subclassFeature.find((row) => row.name === 'Sea' && row.level === 6)!.entries = [
        'You gain resistance to lightning damage and can breathe underwater. Swimming speed is 40 feet.',
      ]
    })
    expect(state(saved, changed).storm?.stages.map((row) => row.available)).toEqual([true, false])
    expect(deriveStormAuraEffects([state(saved, changed)])).toEqual([])
  })
  test('replacement, owner/subclass removal and level rollback preserve independent grants', () => {
    const f = makeStormAuraFixture(6)
    const saved = selectStormAura(f)
    const result = applyClassChoiceSelectionWithGrantsCommand(saved, saved.provenance!, f.choice!, [
      f.choice!.options[0],
    ])
    expect(result.characterPatch.features?.some((row) => row.name === 'Sea')).toBe(false)
    expect(result.characterPatch.features?.some((row) => row.id === 'manual:independent')).toBe(
      true,
    )
    for (const progression of [
      [],
      [{ ...saved.classProgression[0], levels: 2 }],
      [{ ...saved.classProgression[0], subclass: 'Other' }],
    ]) {
      const retained = reconcileClassChoiceSelections(saved.classChoiceSelections, progression)
      expect(retained).toEqual([])
      expect(
        reconcileClassChoiceSelectionGrants(saved, saved.provenance!, retained).features,
      ).toEqual(f.character.features)
    }
    const rolled = { ...saved, classProgression: [{ ...saved.classProgression[0], levels: 3 }] }
    expect(deriveStormAuraEffects([state(rolled, f)])).toEqual([])
  })
  test('same target from two actual owners clears only one owned relation and keeps manual resistance', () => {
    const first = makeStormAuraFixture(6, 'PHB')
    const second = makeStormAuraFixture(6, 'XPHB')
    const saved = selectStormAura(first)
    saved.classProgression.push(second.character.classProgression[0])
    const addition = applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance!,
      second.choice!,
      [second.choice!.options[1]],
    )
    const combined = { ...saved, ...addition.characterPatch, provenance: addition.provenanceUpdate }
    expect(combined.features.filter((row) => row.name === 'Sea')).toHaveLength(2)
    combined.manualEffects = [
      {
        id: 'manual:lightning',
        label: 'Independent resistance',
        source: { kind: 'manual', name: 'Independent' },
        target: { kind: 'damage-resistance', damageType: 'lightning' },
        operation: { kind: 'grant' },
      },
    ]
    const clear = applyClassChoiceSelectionWithGrantsCommand(
      combined,
      combined.provenance!,
      first.choice!,
      [],
    )
    const remaining = { ...combined, ...clear.characterPatch, provenance: clear.provenanceUpdate }
    expect(remaining.classChoiceSelections).toHaveLength(1)
    expect(remaining.classChoiceSelections![0].classSource).toBe('XPHB')
    expect(remaining.features.filter((row) => row.name === 'Sea')).toHaveLength(1)
    expect(
      calc(remaining, second).effects.declarations.some((row) => row.id === 'manual:lightning'),
    ).toBe(true)
    const inverse = applyClassChoiceSelectionWithGrantsCommand(
      remaining,
      remaining.provenance!,
      second.choice!,
      [],
    )
    const empty = { ...remaining, ...inverse.characterPatch, provenance: inverse.provenanceUpdate }
    expect(empty.features).toEqual(first.character.features)
    expect(
      calc(empty, second).effects.declarations.some((row) => row.id === 'manual:lightning'),
    ).toBe(true)
  })
  test.each([
    { name: 'Storm Soul', level: 6 },
    { name: 'Shielding Storm', level: 10 },
    { name: 'Raging Storm', level: 14 },
    { name: 'Sea', level: 6 },
    { name: 'Sea', level: 14 },
  ])('late conflicting producer $name at $level preserves earlier verified Aura', ({
    name,
    level,
  }) => {
    const fixture = makeStormAuraFixture(14)
    const saved = selectStormAura(fixture)
    const changed = makeStormAuraFixture(14, 'PHB', (document) => {
      const row = document.subclassFeature.find(
        (feature) => feature.name === name && feature.level === level,
      )!
      document.subclassFeature.push({ ...row, entries: ['Conflicting source.'] })
    })
    const current = state(saved, changed)
    expect(current.storm?.stages[0].available).toBe(true)
    expect(current.storm?.stages.some((stage) => !stage.available)).toBe(true)
    expect(actions(saved, changed)[0].id).toBe(actions(saved, fixture)[0].id)
  })
  test('new namespace rejects mismatched owner, kind, target and slot on strict reopen', () => {
    const saved = selectStormAura(makeStormAuraFixture())
    for (const change of [
      (row: typeof saved.classChoiceSelections) => {
        row![0].classSource = 'XPHB'
      },
      (row: typeof saved.classChoiceSelections) => {
        row![0].kind = 'feature-option'
      },
      (row: typeof saved.classChoiceSelections) => {
        row![0].selected[0].source = 'PHB'
      },
      (row: typeof saved.classChoiceSelections) => {
        row![0].selected[0].slotLevel = 4
      },
      (row: typeof saved.classChoiceSelections) => {
        row![0].selected[0].ref = 'Sea|Barbarian|XPHB|Storm Herald|XGE|3|XGE'
      },
    ]) {
      const copy = JSON.parse(JSON.stringify(saved))
      change(copy.classChoiceSelections)
      expect(characterPersistenceSchema.safeParse(copy).success).toBe(false)
    }
  })
  test('retained details, both PDF summaries and exact manual action IDs share selected authority', () => {
    const f = makeStormAuraFixture(14)
    const saved = selectStormAura(f)
    const aura = actions(saved, f)[0]
    saved.manualActions = [
      {
        ...aura,
        name: 'My exact Aura',
        description: 'Manual override.',
        source: { kind: 'manual', name: 'My exact Aura' },
      },
    ]
    const vm = createCharacterSheetViewModel(saved, {
      ...f.data.lookups!,
      classChoiceClasses: f.data.classes,
      classChoiceFeatureCatalogs: f.catalogs,
    })
    expect(vm.actions.find((row) => row.id === aura.id)?.name).toBe('My exact Aura')
    const plan = planSheetContent(vm, '2014-custom', { 'bonus-action': [aura.id] })
    expect(plan.groups.find((group) => group.id === 'bonus-action')?.selected).toEqual([aura.id])
    expect(
      deriveCharacterActions(saved, {
        abilityModifiers: calc(saved, f).abilityScores.modifiers,
        proficiencyBonus: 5,
        classes: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      }).filter((row) => row.id === aura.id),
    ).toHaveLength(1)
    for (const summary of [vm.featuresSummary, vm.classFeaturesSummary2014]) {
      expect(summary).toContain('Storm Aura: Sea')
      expect(summary).toContain('breathe underwater')
      expect(summary).not.toContain('flammable object')
    }
    for (const summary of [
      withoutSheetDescriptions(vm).featuresSummary,
      withoutSheetDescriptions(vm).classFeaturesSummary2014,
    ]) {
      expect(summary).toContain('Storm Aura: Sea')
      expect(summary).toContain('Storm Soul — lightning resistance; swim 30 ft.')
      expect(summary).not.toContain('breathe underwater')
    }
    expect(
      buildRetainedCharacterDetails(saved, f.data, null).choiceDetailsById.get(f.choice!.id)?.[0]
        .entries,
    ).toEqual(state(saved, f).details[0].entries)
    const empty = {
      ...f.catalogs,
      subclassFeatures: [],
      subclassFeatureCandidates: new Map(),
      subclassTargets: undefined,
    }
    const unavailable = createCharacterSheetViewModel(saved, {
      ...f.data.lookups!,
      classChoiceClasses: [],
      classChoiceFeatureCatalogs: empty,
    })
    expect(unavailable.actions.find((row) => row.id === aura.id)?.name).toBe('My exact Aura')
    expect(unavailable.actions.some((row) => row.name === 'Raging Storm — Sea')).toBe(false)
    expect(unavailable.featuresSummary).toContain('rules unavailable')
    const restored = createCharacterSheetViewModel(
      { ...saved, manualActions: [] },
      {
        ...f.data.lookups!,
        classChoiceClasses: f.data.classes,
        classChoiceFeatureCatalogs: f.catalogs,
      },
    )
    expect(restored.actions.find((row) => row.id === aura.id)?.name).toBe('Storm Aura — Sea')
    expect(
      planSheetContent(restored, '2014-custom', { 'bonus-action': [aura.id] }).groups.find(
        (group) => group.id === 'bonus-action',
      )?.selected,
    ).toEqual([aura.id])
    const replacement = applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance!,
      f.choice!,
      [f.choice!.options[0]],
    )
    const replaced = {
      ...saved,
      ...replacement.characterPatch,
      provenance: replacement.provenanceUpdate,
      manualActions: [],
    }
    expect(actions(replaced, f)[0].id).not.toBe(aura.id)
  })
})
function getKey() {
  return 'subclass-feature|sea|barbarian|phb|storm herald|xge|3|xge'
}
