import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildFeatLookup } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { createClassChoiceCatalogs } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyLevelDown } from '@/lib/character/commands/classCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceClassFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getEpicBoonSlots, replaceEpicBoonSelection } from '@/lib/character/epicBoonSlots'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature, Feat5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

const path = 'resources/srd/data/class/class-ranger.json'
const parsed = parseClassDocument(JSON.parse(readFileSync(path, 'utf8')), path)
const classes = (parsed.classes as Class5e[]).filter((row) => row.source === 'XPHB')
const feats = (
  JSON.parse(readFileSync('resources/srd/data/feats.json', 'utf8')) as {
    feat: Feat5e[]
  }
).feat
const catalogs = {
  classes,
  classFeatures: parsed.classFeatures as ClassFeature[],
  subclassFeatures: [],
}
const boon = feats.find((row) => row.name === 'Boon of Combat Prowess')!
const alert = feats.find((row) => row.name === 'Alert' && row.source === 'XPHB')!
const owner = { name: 'Ranger', source: 'XPHB' }
const choiceId = 'class:ranger|xphb|choice:epic-boon|19'
const issueId = 'class:asi:Ranger|XPHB:19'

function makeActor() {
  return createEmptyCharacter({
    name: 'Revised Ranger',
    originSystem: '2024',
    classProgression: [{ ...owner, levels: 19 }],
    abilityScores: {
      strength: 10,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 18,
      charisma: 10,
    },
  })
}

function legacy(actor = makeActor()): Character {
  actor = applyCharacterCommandResult(
    actor,
    replaceClassFeatSelectionsCommand(
      actor,
      actor.provenance,
      {
        choiceId,
        className: owner.name,
        classSource: owner.source,
        progressionName: 'Epic Boon',
        categories: ['EB'],
        slotLevels: [19],
      },
      [boon],
    ),
  )
  actor = applyCharacterCommandResult(
    actor,
    commitFeatOptionsCommand(
      actor,
      actor.provenance,
      { name: boon.name, source: boon.source, classFeatChoiceId: choiceId },
      { abilityScore: 'wisdom' },
    ),
  )
  return characterPersistenceSchema.parse({
    ...actor,
    classChoiceSelections: [
      {
        choiceId,
        className: owner.name,
        classSource: owner.source,
        classLevel: 19,
        label: 'Epic Boon',
        kind: 'feat',
        selected: [{ entityType: 'feat', name: boon.name, source: boon.source, slotLevel: 19 }],
      },
    ],
  })
}

function calc(actor: Character, catalog = catalogs, currentFeats = feats) {
  return createCharacterCalculationContext(actor, {
    classChoiceClasses: classes,
    classChoiceFeatureCatalogs: catalog,
    featsByKey: buildFeatLookup(currentFeats),
    featExpertiseFeats: currentFeats,
  })
}

function authority(actor: Character) {
  return { catalogs, feats, prerequisites: buildPrerequisiteSnapshot({ character: actor }) }
}

function slotIssues(actor: Character, calculated = calc(actor)) {
  return validateClassChoices(actor, calculated, createClassChoiceCatalogs(catalogs)).filter(
    (row) => row.id === issueId || row.title === 'Finish Epic Boon',
  )
}

describe('revised Epic Boon advancement', () => {
  test('one current ordinary choice or a matching older choice completes the slot', () => {
    const empty = makeActor()
    const [slot] = getEpicBoonSlots(empty, catalogs, feats)
    expect(slot).toMatchObject({ state: 'empty', allowsAsi: true })
    expect(slotIssues(empty).map(({ id }) => id)).toEqual([issueId])
    const ordinary = characterPersistenceSchema.parse(
      replaceEpicBoonSelection(empty, slot, { feat: alert }, authority(empty)),
    )
    expect(slotIssues(ordinary)).toEqual([])
    const older = legacy()
    const calculated = calc(older)
    expect(calculated.classChoices.epicBoonSlots).toEqual([
      expect.objectContaining({ state: 'selected', legacy: true }),
    ])
    expect(calculated.abilityScores.total.wisdom).toBe(19)
    expect(slotIssues(older, calculated)).toEqual([])
    const [retained] = calculated.classChoices.epicBoonSlots
    const replaced = characterPersistenceSchema.parse(
      replaceEpicBoonSelection(older, retained, { feat: alert }, authority(older)),
    )
    expect(replaced.classFeatChoices).toEqual([])
    expect(replaced.classChoiceSelections).toEqual([])
    expect(replaced.feats.map(({ name }) => name)).toEqual(['Alert'])
    expect(calc(replaced).abilityScores.total.wisdom).toBe(18)
    expect(slotIssues(replaced)).toEqual([])
  })

  test('exact source withdrawal and simultaneous claims withhold only the affected effects', () => {
    const actor = legacy()
    const snapshot = JSON.stringify(actor)
    const missing = calc(actor, { ...catalogs, classFeatures: [] })
    expect(missing.abilityScores.total.wisdom).toBe(18)
    expect(slotIssues(actor, missing).map(({ title }) => title)).toEqual([
      'Restore or remove Epic Boon',
    ])
    const missingTarget = calc(
      actor,
      catalogs,
      feats.filter((row) => row !== boon),
    )
    expect(missingTarget.abilityScores.total.wisdom).toBe(18)
    expect(slotIssues(actor, missingTarget)).toHaveLength(1)
    expect(calc(actor).abilityScores.total.wisdom).toBe(19)
    expect(JSON.stringify(actor)).toBe(snapshot)
    const double = characterPersistenceSchema.parse({
      ...actor,
      asiChoices: [
        {
          id: 'old-conflict',
          className: 'Ranger',
          classSource: 'XPHB',
          level: 19,
          abilityChanges: { wisdom: 2 },
        },
        {
          id: 'other-slot',
          className: 'Ranger',
          classSource: 'XPHB',
          level: 12,
          abilityChanges: { dexterity: 2 },
        },
      ],
    })
    const contested = calc(double)
    expect(contested.abilityScores.total).toMatchObject({ wisdom: 18, dexterity: 16 })
    expect(slotIssues(double, contested).map(({ title }) => title)).toEqual([
      'Resolve Epic Boon choices',
    ])
    const [conflict] = contested.classChoices.epicBoonSlots
    const resolved = characterPersistenceSchema.parse(
      replaceEpicBoonSelection(double, conflict, null),
    )
    expect(resolved.asiChoices?.map(({ id }) => id)).toEqual(['other-slot'])
    expect(resolved.classFeatChoices).toEqual([])
    expect(slotIssues(resolved)).toHaveLength(1)
  })

  test('lost advancement and orphaned mirrors cannot remove an independent owner', () => {
    let actor = legacy()
    actor = applyCharacterCommandResult(
      actor,
      replaceBonusFeatSelectionsCommand(actor, actor.provenance, [boon]),
    )
    actor = applyCharacterCommandResult(
      actor,
      commitFeatOptionsCommand(
        actor,
        actor.provenance,
        { name: boon.name, source: boon.source, selectionKind: 'bonus' },
        { abilityScore: 'strength' },
      ),
    )
    const orphan = { ...actor, classFeatChoices: [] }
    const unavailable = calc(orphan)
    expect(unavailable.abilityScores.total).toMatchObject({ strength: 11, wisdom: 18 })
    expect(slotIssues(orphan, unavailable).map(({ title }) => title)).toEqual([
      'Restore or remove Epic Boon',
    ])
    const lower = characterPersistenceSchema.parse(
      applyCharacterCommandResult(actor, applyLevelDown(actor, actor.provenance, calc(actor))),
    )
    expect(lower.classProgression[0].levels).toBe(18)
    expect(lower.classChoiceSelections).toEqual([])
    expect(lower.classFeatChoices).toEqual([])
    expect(lower.specialFeats?.map((feat) => feat.name)).toEqual([boon.name])
    expect(calc(lower).abilityScores.total).toMatchObject({ strength: 11, wisdom: 18 })
    expect(slotIssues(lower)).toEqual([])
  })

  test('stale commands and independent nonrepeatable feats cannot claim the slot', () => {
    const empty = makeActor()
    const [slot] = getEpicBoonSlots(empty, catalogs, feats)
    const selected = replaceEpicBoonSelection(empty, slot, { feat: alert }, authority(empty))
    expect(replaceEpicBoonSelection(selected, slot, null)).toBe(selected)
    expect(replaceEpicBoonSelection(selected, slot, { feat: boon }, authority(selected))).toBe(
      selected,
    )
    const bonus = applyCharacterCommandResult(
      empty,
      replaceBonusFeatSelectionsCommand(empty, empty.provenance, [alert]),
    )
    const [fresh] = getEpicBoonSlots(bonus, catalogs, feats)
    expect(replaceEpicBoonSelection(bonus, fresh, { feat: alert }, authority(bonus))).toBe(bonus)
  })

  test('an ID collision cannot clear a saved row belonging to another printing', () => {
    const actor = legacy()
    const [selection] = actor.classChoiceSelections ?? []
    const [mirror] = actor.classFeatChoices ?? []
    const otherSelection = { ...selection, classSource: 'PHB' }
    const otherMirror = {
      ...mirror,
      classSource: 'PHB',
      feats: mirror.feats.map((feat) => ({ ...feat, classSource: 'PHB' })),
    }
    const mixed = characterPersistenceSchema.parse({
      ...actor,
      classChoiceSelections: [selection, otherSelection],
      classFeatChoices: [mirror, otherMirror],
    })
    const calculated = calc(mixed)
    expect(calculated.abilityScores.total.wisdom).toBe(18)
    const [slot] = calculated.classChoices.epicBoonSlots
    expect(slot.state).toBe('conflict')
    const cleared = replaceEpicBoonSelection(mixed, slot, null)
    expect(cleared.classChoiceSelections).toEqual([otherSelection])
    expect(cleared.classFeatChoices).toEqual([otherMirror])
    expect(calc(cleared).abilityScores.total.wisdom).toBe(18)
  })

  test('an inconsistent old bonus and an over-cap ASI remain recoverable without benefits', () => {
    const actor = legacy()
    const [mirror] = actor.classFeatChoices ?? []
    const mismatched = characterPersistenceSchema.parse({
      ...actor,
      classFeatChoices: [
        {
          ...mirror,
          feats: mirror.feats.map((feat) => ({ ...feat, options: { abilityScore: 'strength' } })),
        },
      ],
    })
    const mismatch = calc(mismatched)
    expect(mismatch.classChoices.epicBoonSlots[0].state).toBe('unavailable')
    expect(mismatch.abilityScores.total).toMatchObject({ strength: 10, wisdom: 18 })

    const overCap = characterPersistenceSchema.parse({
      ...makeActor(),
      abilityScores: { ...actor.abilityScores, wisdom: 19 },
      asiChoices: [
        {
          id: 'old-epic-asi',
          className: 'Ranger',
          classSource: 'XPHB',
          level: 19,
          abilityChanges: { wisdom: 2 },
        },
      ],
    })
    const over = calc(overCap)
    expect(over.classChoices.epicBoonSlots[0].state).toBe('unavailable')
    expect(over.character.asiChoices).toEqual([])
    expect(over.abilityScores.total.wisdom).toBe(19)
    expect(overCap.asiChoices).toHaveLength(1)
  })

  test.each([
    ['minimum', 19, 20],
    ['add', 1, 21],
  ] as const)('a manual %s effect does not suspend a legal retained increase', (kind, value, after) => {
    const base = makeActor()
    const actor = characterPersistenceSchema.parse({
      ...base,
      abilityScores: { ...base.abilityScores, strength: 18 },
      asiChoices: [
        {
          id: 'earned-epic-asi',
          className: 'Ranger',
          classSource: 'XPHB',
          level: 19,
          abilityChanges: { strength: 2 },
        },
      ],
      manualEffects: [
        {
          id: 'temporary-strength',
          label: 'Temporary Strength',
          target: { kind: 'ability-score', ability: 'strength' },
          operation: { kind, value },
          source: { kind: 'manual', name: 'Temporary Strength' },
        },
      ],
    })
    expect(calc({ ...actor, asiChoices: [] }).abilityScores.total.strength).toBe(19)
    const result = calc(actor)
    expect(result.classChoices.epicBoonSlots[0].state).toBe('selected')
    expect(result.abilityScores.total.strength).toBe(after)
  })

  test('an ambiguous exact declaration reserves one unavailable slot', () => {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const original = raw.classFeature.find(
      (row: ClassFeature) => row.name === 'Epic Boon' && row.source === 'XPHB',
    )
    raw.classFeature.push({ ...original, page: 999 })
    const duplicate = parseClassDocument(raw, path)
    const uncertain = {
      ...catalogs,
      classes: (duplicate.classes as Class5e[]).filter((row) => row.source === 'XPHB'),
      classFeatures: duplicate.classFeatures as ClassFeature[],
    }
    const actor = makeActor()
    const context = calc(actor, uncertain)
    const [slot] = context.classChoices.epicBoonSlots
    expect(slot).toMatchObject({ state: 'unavailable', current: false, allowsAsi: false })
    expect(slotIssues(actor, context).map(({ title }) => title)).toEqual([
      'Restore or remove Epic Boon',
    ])
    expect(
      replaceEpicBoonSelection(
        actor,
        slot,
        { feat: alert },
        { ...authority(actor), catalogs: uncertain },
      ),
    ).toBe(actor)
  })

  test.each([
    { ref: 'Epic Boon|Ranger|XPHB|19|PHB', source: 'PHB' },
    { ref: 'Epic Boon|Ranger|PHB|19|XPHB', classSource: 'PHB' },
    { ref: 'Epic Boon|Paladin|XPHB|19', className: 'Paladin' },
    { gainSubclassFeature: true },
  ])('a conflicting declaration %o never opens a generic ASI slot', (conflict) => {
    const ranger = classes[0]
    const wrong = {
      ...catalogs,
      classes: [
        {
          ...ranger,
          classFeatureRefs: ranger.classFeatureRefs?.map((ref) =>
            ref.name === 'Epic Boon' ? { ...ref, ...conflict } : ref,
          ),
        },
      ],
    }
    const actor = makeActor()
    const calculated = calc(actor, wrong)
    expect(calculated.classChoices.epicBoonSlots[0]).toMatchObject({
      state: 'unavailable',
      current: false,
      allowsAsi: false,
    })
    expect(slotIssues(actor, calculated).map(({ title }) => title)).toEqual([
      'Restore or remove Epic Boon',
    ])
  })

  test('a misplaced revised Epic Boon cannot supply a generic advancement at level 18', () => {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const ranger = raw.class.find((row: Class5e) => row.source === 'XPHB')
    ranger.classFeatures = ranger.classFeatures.map((ref: unknown) =>
      ref === 'Epic Boon|Ranger|XPHB|19' ? 'Epic Boon|Ranger|XPHB|18' : ref,
    )
    const source = raw.classFeature.find(
      (row: ClassFeature) => row.name === 'Epic Boon' && row.source === 'XPHB',
    )
    source.level = 18
    source.entries = [
      'You gain an {@filter Epic Boon feat|feats|category=EB} or another {@5etools feat|feats.html} of your choice for which you qualify. {@feat Boon of Combat Prowess|XPHB} is recommended.',
    ]
    const altered = parseClassDocument(raw, path)
    const alteredRanger = (altered.classes as Class5e[]).find((row) => row.source === 'XPHB')
    expect(alteredRanger?.normalizedRules?.asiLevels).toEqual([4, 8, 12, 16])
    expect(
      alteredRanger?.normalizedRules?.choices?.some((choice) => choice.label === 'Epic Boon'),
    ).toBe(false)
    expect(alteredRanger?.normalizedRules?.choiceDiagnostics).toContainEqual(
      expect.objectContaining({
        featureName: 'Epic Boon',
        level: 18,
        code: 'unverified-required-choice',
      }),
    )
  })

  test('losing the entire level-19 gain retains the ordinary claim without granting it', () => {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const ranger = raw.class.find((row: Class5e) => row.source === 'XPHB')
    ranger.classFeatures = ranger.classFeatures.filter(
      (ref: unknown) => !JSON.stringify(ref).includes('Epic Boon|Ranger|XPHB|19'),
    )
    const removed = parseClassDocument(raw, path)
    const missing = {
      ...catalogs,
      classes: (removed.classes as Class5e[]).filter((row) => row.source === 'XPHB'),
      classFeatures: removed.classFeatures as ClassFeature[],
    }
    const empty = makeActor()
    const [slot] = getEpicBoonSlots(empty, catalogs, feats)
    const saved = characterPersistenceSchema.parse(
      replaceEpicBoonSelection(empty, slot, { feat: alert }, authority(empty)),
    )
    const context = calc(saved, missing)
    expect(context.classChoices.epicBoonSlots[0].state).toBe('unavailable')
    expect(context.character.feats).toEqual([])
    expect(saved.feats).toHaveLength(1)
    expect(calc(saved).character.feats).toEqual(saved.feats)
    expect(getEpicBoonSlots(empty, missing, feats, { ranger: classes[0] })[0].state).toBe(
      'unavailable',
    )
  })

  test('rejects a stale normalized write even when its current source is absent', () => {
    const actor = makeActor()
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        actor,
        actor.provenance,
        {
          id: choiceId,
          label: 'Epic Boon',
          kind: 'feat',
          owner: { ...owner, type: 'class', featureName: 'Epic Boon', featureSource: 'XPHB' },
          level: 19,
          minimumSelections: 1,
          maximumSelections: 1,
          options: [],
          selectionCountByLevel: Array.from({ length: 20 }, (_, index) => Number(index >= 18)),
          optionFilter: { entityType: 'feat', categories: ['EB'] },
          repeatable: false,
          replacement: { cadence: 'never' },
          source: {
            kind: 'class-feature-options',
            field: 'classFeatureRefs:Epic Boon|Ranger|XPHB|19:entries.filter',
          },
        },
        [{ entityType: 'feat', name: boon.name, source: boon.source }],
        { classes, catalogs: { ...catalogs, classes: [], classFeatures: [] }, feats },
      ),
    ).toThrow(/through the Epic Boon advancement slot/)
  })

  test('the exact ASI alternative uses one capped allocation and rejects reassignment', () => {
    const empty = makeActor()
    const [slot] = getEpicBoonSlots(empty, catalogs, feats)
    const before = empty.abilityScores
    const increased = replaceEpicBoonSelection(
      empty,
      slot,
      { abilityChanges: { wisdom: 2 }, before },
      authority(empty),
    )
    expect(calc(increased).abilityScores.total.wisdom).toBe(20)
    expect(slotIssues(increased)).toEqual([])
    expect(
      replaceEpicBoonSelection(
        empty,
        slot,
        {
          abilityChanges: { wisdom: 2 },
          before: { ...before, wisdom: 19 },
        },
        authority(empty),
      ),
    ).toBe(empty)
    const ownsAlert = applyCharacterCommandResult(
      empty,
      replaceFeatSelectionsCommand(empty, empty.provenance, [alert]),
    )
    expect(replaceEpicBoonSelection(ownsAlert, slot, { feat: alert }, authority(ownsAlert))).toBe(
      ownsAlert,
    )
  })
})
