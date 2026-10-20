import { describe, expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  characterUsesContentOutsideCatalog,
  createGameDataAvailabilityIndex,
} from '@/lib/character/additionalContentAvailability'
import {
  buildClassChoiceFeatureCatalogs,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  getFeatureOptionSelectionStates,
  summarizeFeatureOptionSelection,
} from '@/lib/character/featureOptionSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { withoutSheetDescriptions } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { detectSourceConflicts } from '@/lib/sourceConflicts'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeFeatureOptionFixture,
  pruneFeatureOptionDeclaration,
  selectFeatureOption,
} from '../fixtures/featureOptionFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'
import { dragonSetupDocument } from '../fixtures/requiredSetupFixtures'

function state(character: Character, fixture: ReturnType<typeof makeFeatureOptionFixture>) {
  return getFeatureOptionSelectionStates(character, fixture.data.classes, fixture.catalogs)[0]
}
function issues(character: Character, fixture: ReturnType<typeof makeFeatureOptionFixture>) {
  return validateClassChoices(
    character,
    createCharacterCalculationContext(character, fixture.data.lookups!),
    fixture.catalogs,
  ).filter(
    (issue) =>
      issue.title.includes('Dragon Ancestor') || issue.title.includes('Elemental Affinity'),
  )
}
function sheet(character: Character, fixture: ReturnType<typeof makeFeatureOptionFixture>) {
  return createCurrentCharacterSheetViewModel(character, {
    ...fixture.data.lookups!,
    classChoiceFeatureCatalogs: fixture.catalogs,
  })
}

describe('feature-option selection lifecycle', () => {
  test('select/reopen preserves intent and unrelated state while later context stays unearned', () => {
    const fixture = makeFeatureOptionFixture()
    const saved = selectFeatureOption(fixture)
    expect(saved.features).toEqual(fixture.character.features)
    expect(saved.proficiencies).toEqual(fixture.character.proficiencies)
    const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
    expect(reopened.classChoiceSelections).toEqual(saved.classChoiceSelections)
    const current = state(reopened, fixture)
    expect(current.recovery).toBe(false)
    expect(current.details[0]).toMatchObject({ name: 'Red', damageType: 'Fire', available: true })
    expect(current.affinity).toBeUndefined()
    expect(issues(reopened, fixture)).toEqual([])
    expect(summarizeFeatureOptionSelection(current)).not.toContain('Elemental Affinity')
    const noOp = applyClassChoiceSelectionWithGrantsCommand(
      reopened,
      reopened.provenance!,
      fixture.choice!,
      [{ ...reopened.classChoiceSelections![0].selected[0], name: ' RED ', source: ' phb ' }],
    )
    expect(noOp.characterPatch).toEqual({})
    expect(noOp.provenanceUpdate).toBe(reopened.provenance)
  })

  test('exact earned PHB Affinity context reaches Overview and both PDF summaries, including description-off', () => {
    const fixture = makeFeatureOptionFixture(6)
    const saved = selectFeatureOption(fixture)
    const current = state(saved, fixture)
    expect(current.affinity?.available).toBe(true)
    const text = summarizeFeatureOptionSelection(current)
    expect(text).toContain('Red — Fire')
    expect(text).toContain('Elemental Affinity')
    expect(text).toContain('Charisma modifier to one damage roll')
    expect(text).toContain('spend 1 sorcery point')
    expect(text).toContain('for 1 hour')
    const details = buildRetainedCharacterDetails(saved, fixture.data, null)
    expect(details.choiceDetailsById.get(fixture.choice!.id)?.[0].availability).toBe('available')
    const vm = sheet(saved, fixture)
    for (const summary of [vm.featuresSummary, vm.classFeaturesSummary2014]) {
      expect(summary).toContain('Dragon Ancestor: Red — Fire')
      expect(summary).toContain('spend 1 sorcery point')
    }
    const compact = withoutSheetDescriptions(vm)
    for (const summary of [compact.featuresSummary, compact.classFeaturesSummary2014]) {
      expect(summary).toContain('Dragon Ancestor: Red — Fire')
      expect(summary).toContain('Elemental Affinity — Fire')
      expect(summary).not.toContain('spend 1 sorcery point')
    }
    expect(
      vm.actions.some(
        (action) => action.name === 'Dragon Ancestor' || action.name === 'Elemental Affinity',
      ),
    ).toBe(false)
    const effects = createCharacterCalculationContext(saved, fixture.data.lookups!).effects
      .declarations
    expect(effects.some((effect) => effect.target.kind === 'damage-resistance')).toBe(false)
    expect(issues(saved, fixture)).toEqual([])
  })

  test.each([
    'source',
    'body',
  ] as const)('missing or changed Affinity %s stays unverified until exact restoration', (kind) => {
    const original = makeFeatureOptionFixture(6)
    const saved = selectFeatureOption(original)
    const changed = makeFeatureOptionFixture(6, (document) => {
      const affinity = document.subclassFeature.find(
        (feature) => feature.name === 'Elemental Affinity' && feature.source === 'PHB',
      )!
      if (kind === 'source') affinity.source = 'XPHB'
      else affinity.entries = ['A different conditional rule.']
    })
    const serialized = JSON.stringify(saved)
    expect(state(saved, changed).details[0].damageType).toBe('Fire')
    expect(state(saved, changed).affinity?.available).toBe(false)
    expect(issues(saved, changed).map((issue) => issue.title)).toEqual([
      'Restore Elemental Affinity rules',
    ])
    expect(withoutSheetDescriptions(sheet(saved, changed)).featuresSummary).toContain(
      'Elemental Affinity rules unavailable',
    )
    expect(state(saved, original).affinity?.available).toBe(true)
    expect(issues(saved, original)).toEqual([])
    expect(JSON.stringify(saved)).toBe(serialized)
  })

  test('wholly pruned declaration retains routed recovery without guessing a quota; exact restoration keeps bytes', () => {
    const original = makeFeatureOptionFixture()
    const saved = selectFeatureOption(original)
    const pruned = makeFeatureOptionFixture(1, pruneFeatureOptionDeclaration)
    expect(pruned.choice).toBeUndefined()
    expect(pruned.subclass.normalizedRules!.choiceDiagnostics).toEqual([])
    const serialized = JSON.stringify(saved)
    const current = state(saved, pruned)
    expect(current.recovery).toBe(true)
    expect(current.choice).toBeUndefined()
    expect(current.details[0]).toMatchObject({ name: 'Red', available: false })
    expect(current.details[0].damageType).toBeUndefined()
    const blockers = issues(saved, pruned)
    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toMatchObject({
      title: 'Restore or remove Dragon Ancestor',
      severity: 'blocking',
    })
    expect(new URLSearchParams(blockers[0].navigationTarget.split('?')[1]).get('choice')).toBe(
      saved.classChoiceSelections![0].choiceId,
    )
    expect(sheet(saved, pruned).featuresSummary).toContain('Red (rules unavailable)')
    expect(state(saved, original).recovery).toBe(false)
    expect(issues(saved, original)).toEqual([])
    expect(JSON.stringify(saved)).toBe(serialized)
    const clear = retainSavedFeatureOptionsCommand(
      saved,
      saved.provenance!,
      saved.classChoiceSelections![0].choiceId,
      [],
    )
    const cleared = characterPersistenceSchema.parse({
      ...saved,
      ...clear.characterPatch,
      provenance: clear.provenanceUpdate,
    })
    expect(cleared.classChoiceSelections).toEqual([])
    expect(cleared.features).toEqual(saved.features)
    expect(cleared.proficiencies).toEqual(saved.proficiencies)
    expect(issues(cleared, pruned)).toEqual([])
  })

  test('an explicit empty filtered bundle cannot replenish rows from live embedded class rules', () => {
    const fixture = makeFeatureOptionFixture()
    const saved = selectFeatureOption(fixture)
    const empty = {
      ...fixture,
      catalogs: {
        ...fixture.catalogs,
        classFeatures: [],
        subclassFeatures: [],
        subclassFeatureCandidates: new Map(),
        subclassTargets: undefined,
      },
    }
    expect(state(saved, empty).recovery).toBe(true)
    expect(issues(saved, empty).map((issue) => issue.title)).toEqual([
      'Restore or remove Dragon Ancestor',
    ])
    expect(state(saved, fixture).recovery).toBe(false)
    const missingIndex = createGameDataAvailabilityIndex({ ...fixture.data, classes: [] })
    expect(characterUsesContentOutsideCatalog(saved, missingIndex)).toBe(true)
    // Other fixture origins intentionally have no catalog, so inspect literal details independently.
    expect(
      buildRetainedCharacterDetails(saved, fixture.data, null).choiceDetailsById.get(
        fixture.choice!.id,
      )?.[0].availability,
    ).toBe('available')
  })

  test('recovery retains only an existing subset, is idempotent and cannot manufacture a replacement', () => {
    const fixture = makeFeatureOptionFixture()
    const saved = selectFeatureOption(fixture)
    const selection = saved.classChoiceSelections![0]
    const key = getClassChoiceOptionKey(selection.selected[0])
    expect(
      retainSavedFeatureOptionsCommand(saved, saved.provenance!, selection.choiceId, [key])
        .characterPatch,
    ).toEqual({})
    expect(() =>
      retainSavedFeatureOptionsCommand(saved, saved.provenance!, selection.choiceId, [
        'new-choice',
      ]),
    ).toThrow(/existing selections/)
    const clear = retainSavedFeatureOptionsCommand(saved, saved.provenance!, selection.choiceId, [])
    const cleared = { ...saved, ...clear.characterPatch, provenance: clear.provenanceUpdate }
    expect(
      retainSavedFeatureOptionsCommand(cleared, cleared.provenance!, selection.choiceId, [])
        .characterPatch,
    ).toEqual({})
  })

  test('two actual selected owners keep independent row intents when one is cleared or leveled down', () => {
    const fixture = makeFeatureOptionFixture()
    const revisedDocument = dragonSetupDocument(true)
    const revised = parseClasses(revisedDocument)[0] as Class5e
    const data = {
      ...fixture.data,
      classes: [...fixture.data.classes.filter((row) => row.source !== 'XPHB'), revised],
      classFeatures: [
        ...fixture.data.classFeatures,
        ...(parseClassFeatures(revisedDocument) as ClassFeature[]),
      ],
    }
    data.lookups = buildGameDataLookups(data)
    const character = {
      ...selectFeatureOption(fixture),
      allowedSources: ['PHB', 'XPHB'],
      classProgression: [
        ...fixture.character.classProgression,
        {
          name: 'Sorcerer',
          source: 'XPHB',
          subclass: 'Draconic Bloodline',
          subclassSource: 'PHB',
          levels: 3,
        },
      ],
    }
    const choice = revised.subclasses![0].normalizedRules!.choices.find(
      (row) => row.kind === 'feature-option',
    )!
    const apply = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance!,
      choice,
      [choice.options[1]],
    )
    const both = characterPersistenceSchema.parse({
      ...character,
      ...apply.characterPatch,
      provenance: apply.provenanceUpdate,
    })
    const catalogs = { ...fixture.catalogs, ...buildClassChoiceFeatureCatalogs(data) }
    expect(
      getFeatureOptionSelectionStates(both, data.classes, catalogs).every((row) => !row.recovery),
    ).toBe(true)
    const clear = retainSavedFeatureOptionsCommand(both, both.provenance!, fixture.choice!.id, [])
    expect(clear.characterPatch.classChoiceSelections?.map((row) => row.choiceId)).toEqual([
      choice.id,
    ])
    const rollback = applyClassProgressionUpdate(both, both.provenance!, [
      fixture.character.classProgression[0],
      { ...both.classProgression[1], levels: 2 },
    ])
    expect(rollback.characterPatch.classChoiceSelections?.map((row) => row.choiceId)).toEqual([
      fixture.choice!.id,
    ])
    expect(rollback.characterPatch.features).toEqual(both.features)
  })

  test('actual subclass removal retracts this intent and preserves unrelated player state', () => {
    const fixture = makeFeatureOptionFixture()
    const saved = selectFeatureOption(fixture)
    const result = applyClassProgressionUpdate(saved, saved.provenance!, [
      { ...saved.classProgression[0], subclass: undefined, subclassSource: undefined },
    ])
    expect(result.characterPatch.classChoiceSelections).toEqual([])
    expect(result.characterPatch.features).toEqual(saved.features)
    expect(result.characterPatch.proficiencies).toEqual(saved.proficiencies)
  })
})

test('a removed selected row cannot lend unbound Affinity context to either PDF summary; exact restoration is read-only', () => {
  const clean = makeFeatureOptionFixture(6)
  const saved = selectFeatureOption(clean)
  const bytes = JSON.stringify(saved)
  const changed = makeFeatureOptionFixture(6, (document) => {
    const ancestor = document.subclassFeature.find(
      (row) => row.name === 'Dragon Ancestor' && row.source === 'PHB',
    )!
    const table = ancestor.entries!.find(
      (entry) =>
        entry && typeof entry === 'object' && (entry as { type?: string }).type === 'table',
    ) as { rows: string[][] }
    table.rows = table.rows.filter((row) => row[0] !== 'Red')
  })
  const lost = state(saved, changed)
  expect(lost.details[0].available).toBe(false)
  const unavailable = sheet(saved, changed)
  for (const view of [unavailable, withoutSheetDescriptions(unavailable)]) {
    for (const summary of [view.featuresSummary, view.classFeaturesSummary2014]) {
      expect(summary).toContain('Red (rules unavailable)')
      expect(summary).not.toContain('Elemental Affinity')
    }
  }
  const restored = sheet(saved, clean)
  expect(withoutSheetDescriptions(restored).featuresSummary).toContain('Elemental Affinity — Fire')
  expect(JSON.stringify(saved)).toBe(bytes)
})

test('availability and disabled-source checks resolve literal rows from the current source bundle and encoded printing', () => {
  const fixture = makeFeatureOptionFixture()
  const saved = selectFeatureOption(fixture)
  const isolated = {
    ...saved,
    race: '',
    raceSource: undefined,
    subrace: undefined,
    subraceSource: undefined,
    background: '',
    backgroundSource: undefined,
    feats: [],
    specialFeats: [],
    classFeatChoices: [],
    equipment: [],
    spellProfiles: [],
    features: [],
  }
  const live = createGameDataAvailabilityIndex(fixture.data)
  expect(characterUsesContentOutsideCatalog(isolated, live)).toBe(false)
  const missing = makeFeatureOptionFixture(1, pruneFeatureOptionDeclaration)
  expect(
    characterUsesContentOutsideCatalog(isolated, createGameDataAvailabilityIndex(missing.data)),
  ).toBe(true)
  expect(characterUsesContentOutsideCatalog(isolated, live)).toBe(false)
  const noDuplicatedSource = {
    ...saved,
    classChoiceSelections: saved.classChoiceSelections!.map((selection) => ({
      ...selection,
      selected: selection.selected.map((row) => ({ ...row, source: undefined })),
    })),
  }
  expect(detectSourceConflicts(noDuplicatedSource, [])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: 'PHB', items: expect.arrayContaining(['Red']) }),
    ]),
  )
})
