import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { reconcileOptionalClassFeatureChoicesCommand } from '@/lib/character/commands/classChoiceVariantCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCannyFixture, selectCanny } from '../fixtures/cannyFixtures'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'

const apply = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
const configured = () => {
  const fixture = makeCannyFixture(10)
  return {
    fixture,
    character: selectCanny(
      fixture,
      'languages',
      ['Elvish', 'Dwarvish'],
      selectCanny(fixture, 'expertise', ['Survival']),
    ),
  }
}

test('real adopted passive roots and earned children reach full and names-only PDF summaries without saved Feature materialization', () => {
  const { data, catalogs } = makeOptionalClassSourceData()
  let character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 10 }],
    variantRules: { optionalClassFeatures: true },
  })
  for (const root of OPTIONAL_CLASS_FEATURE_RULES.roots)
    character = apply(
      character,
      setOptionalClassAdoptionCommand(
        character,
        character.provenance,
        catalogs,
        { owner: root.owner, target: root.target, earnedLevel: root.level },
        true,
        [],
      ),
    )
  const before = JSON.stringify(character)
  const input = {
    ...data.lookups!,
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const vm = createCharacterSheetViewModel(character, input)
  for (const view of [vm, withoutSheetDescriptions(vm)])
    for (const summary of [view.featuresSummary, view.classFeaturesSummary2014]) {
      for (const name of [
        'Deft Explorer',
        'Favored Foe',
        'Spellcasting Focus',
        'Deft Explorer Improvement (Level 6)',
        'Deft Explorer Improvement (Level 10)',
      ])
        expect(summary).toContain(name)
    }
  expect(vm.featuresSummary).toContain('Roving')
  expect(vm.featuresSummary).toContain('Tireless')
  expect(withoutSheetDescriptions(vm).featuresSummary).not.toContain('Roving')
  expect(character.features).toEqual([])
  const off = createCharacterSheetViewModel(
    { ...character, variantRules: { optionalClassFeatures: false } },
    input,
  )
  expect(off.optionalClassFeatureSummaries).toEqual([])
  const unavailable = createCharacterSheetViewModel(character, {
    ...input,
    classChoiceFeatureCatalogs: { ...catalogs, optionalClassFeatureSources: [] },
  })
  expect(unavailable.optionalClassFeatureSummaries).toEqual([])
  const lostChild = makeOptionalClassSourceData((doc) => {
    doc.classFeature = doc.classFeature.filter(
      (row) => !(row.name === 'Deft Explorer Improvement' && row.level === 10),
    )
  })
  const childView = createCharacterSheetViewModel(character, {
    ...input,
    classChoiceFeatureCatalogs: lostChild.catalogs,
  })
  expect(childView.optionalClassFeatureSummaries?.map((row) => row.compactText)).toEqual([
    'Deft Explorer',
    'Deft Explorer Improvement',
    'Favored Foe',
    'Spellcasting Focus',
  ])
  expect(createCharacterSheetViewModel(character, input).optionalClassFeatureSummaries).toEqual(
    vm.optionalClassFeatureSummaries,
  )
  expect(JSON.stringify(character)).toBe(before)
})

test('Clear retains exact dormant setup; explicit adoption reuses it and pending original choices cannot authorize Canny', () => {
  const { fixture: f, character } = configured()
  const request = character.optionalClassFeatureAdoptions![0]
  const before = JSON.stringify(character)
  const cleared = apply(
    character,
    setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      f.catalogs,
      request,
      false,
      getOptionalClassFamilyKeys(character, request),
    ),
  )
  expect(cleared.optionalClassFeatureAdoptions).toEqual([])
  expect(cleared.proficiencies.expertise).toEqual([])
  expect(cleared.proficiencies.languages).toEqual([])
  expect(cleared.classChoiceSelections!.map((row) => row.selected)).toEqual(
    character.classChoiceSelections!.map((row) => row.selected),
  )
  expect(cleared.classChoiceSelections!.every((row) => row.inactive)).toBe(true)
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      cleared,
      cleared.provenance,
      f.choices[0],
      [getProficiencyOption('expertise', 'Survival')],
      { classes: f.data.classes, catalogs: f.catalogs },
    ),
  ).toThrow(/source rules/)
  const adopted = apply(
    cleared,
    setOptionalClassAdoptionCommand(cleared, cleared.provenance, f.catalogs, request, true, []),
  )
  expect(adopted.proficiencies.expertise).toEqual(character.proficiencies.expertise)
  expect(adopted.proficiencies.languages).toEqual(character.proficiencies.languages)
  expect(adopted.classChoiceSelections!.map((row) => row.selected)).toEqual(
    character.classChoiceSelections!.map((row) => row.selected),
  )
  expect(JSON.stringify(character)).toBe(before)
})

test('OFF/ON reconciles only explicit adoption; missing adoption with old complete setup stays dormant in calculations and PDF', () => {
  const { fixture: f, character } = configured()
  const authority = {
    availableClasses: f.data.classes,
    allClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const offResult = reconcileOptionalClassFeatureChoicesCommand(
    character,
    character.provenance,
    authority,
    false,
  )
  const off = apply(character, {
    ...offResult,
    characterPatch: { ...offResult.characterPatch, variantRules: { optionalClassFeatures: false } },
  })
  expect(off.optionalClassFeatureAdoptions).toEqual(character.optionalClassFeatureAdoptions)
  expect(off.proficiencies.expertise).toEqual([])
  const onResult = reconcileOptionalClassFeatureChoicesCommand(off, off.provenance, authority, true)
  const on = apply(off, {
    ...onResult,
    characterPatch: { ...onResult.characterPatch, variantRules: { optionalClassFeatures: true } },
  })
  expect(on.proficiencies.expertise).toEqual(character.proficiencies.expertise)
  const legacy = { ...character, optionalClassFeatureAdoptions: undefined }
  const vm = createCharacterSheetViewModel(legacy, {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  })
  expect(vm.character.proficiencies.expertise).toEqual([])
  expect(vm.character.proficiencies.languages).toEqual([])
  expect(legacy.classChoiceSelections).toEqual(character.classChoiceSelections)
})

test('source-free clear and unchanged commands preserve supplied independent ownership; stale family changes reject', () => {
  const { fixture: f, character } = configured()
  const request = character.optionalClassFeatureAdoptions![0]
  const ledger = {
    ...character.provenance,
    features: {
      ...character.provenance.features,
      Independent: [
        {
          sourceType: 'manual' as const,
          sourceName: 'Independent',
          grantType: 'fixed' as const,
          label: 'Keep',
        },
      ],
    },
  }
  const missing = {
    ...f.catalogs,
    optionalClassFeatureSources: [],
    classFeatures: [],
    classFeatureCandidates: new Map(),
  }
  expect(createOptionalClassFeatureActivity(character, missing).states[0].state).toBe('unavailable')
  expect(() =>
    setOptionalClassAdoptionCommand(character, ledger, missing, request, false, []),
  ).toThrow(/changed/)
  const cleared = setOptionalClassAdoptionCommand(
    character,
    ledger,
    missing,
    request,
    false,
    getOptionalClassFamilyKeys(character, request),
  )
  expect(cleared.provenanceUpdate.features.Independent).toEqual(ledger.features.Independent)
  const saved = apply(character, cleared)
  const unchanged = setOptionalClassAdoptionCommand(
    saved,
    saved.provenance,
    missing,
    request,
    false,
    [],
  )
  expect(unchanged.characterPatch).toEqual({})
  expect(unchanged.provenanceUpdate).toBe(saved.provenance)
})

test('new adoption rechecks current source, source permission, earned level and the global permission', () => {
  const { fixture: f, character } = configured()
  const request = character.optionalClassFeatureAdoptions![0]
  const cleared = apply(
    character,
    setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      f.catalogs,
      request,
      false,
      getOptionalClassFamilyKeys(character, request),
    ),
  )
  for (const current of [
    { ...cleared, variantRules: { optionalClassFeatures: false } },
    { ...cleared, allowedSources: ['PHB'] },
    { ...cleared, classProgression: [{ name: 'Fighter', source: 'PHB', levels: 10 }] },
  ])
    expect(() =>
      setOptionalClassAdoptionCommand(current, current.provenance, f.catalogs, request, true, []),
    ).toThrow(/cannot verify/)
  expect(() =>
    setOptionalClassAdoptionCommand(
      cleared,
      cleared.provenance,
      { ...f.catalogs, optionalClassFeatureSources: [] },
      request,
      true,
      [],
    ),
  ).toThrow(/cannot verify/)
})

test('intentional level/owner mutation retains earned root but removes an unearned root and its setup atomically', () => {
  const { fixture: f, character } = configured()
  const lower = apply(
    character,
    applyClassProgressionUpdate(
      character,
      character.provenance,
      [{ name: 'Ranger', source: 'PHB', levels: 5 }],
      undefined,
      { classChoiceFeatureCatalogs: f.catalogs },
    ),
  )
  expect(lower.optionalClassFeatureAdoptions).toEqual(character.optionalClassFeatureAdoptions)
  expect(lower.proficiencies.expertise).toEqual(character.proficiencies.expertise)
  const removed = apply(
    character,
    applyClassProgressionUpdate(
      character,
      character.provenance,
      [{ name: 'Fighter', source: 'PHB', levels: 10 }],
      undefined,
      { classChoiceFeatureCatalogs: f.catalogs },
    ),
  )
  expect(removed.optionalClassFeatureAdoptions).toEqual([])
  expect(removed.classChoiceSelections).toEqual([])
  expect(removed.proficiencies.expertise).toEqual([])
})
