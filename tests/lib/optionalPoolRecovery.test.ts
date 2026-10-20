import { expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceIdentity'
import { createClassChoiceCatalogs } from '@/lib/character/classChoiceOptions'
import { retainSavedFeatureOptionsCommand } from '@/lib/character/commands/classChoiceCommands'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { classChoiceReadinessId } from '@/lib/navigation/readinessFocus'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import {
  makeOptionalPoolRecoveryFixture,
  optionalPoolRecoveryCases,
} from '../fixtures/optionalPoolRecoveryFixtures'

const absent = {
  classes: [],
  classFeatures: [],
  subclassFeatures: [],
  optionalClassFeatureSources: [],
  optionalClassSections: [],
}
test.each(
  optionalPoolRecoveryCases,
)('%s/%s gain%s retains and clears exact source-absent saved pool setup', (...row) => {
  const f = makeOptionalPoolRecoveryFixture(row),
    { character, selection } = f
  const handle = getOptionalPoolSelectionHandle(selection)!
  const original = JSON.stringify(character)
  const states = getFeatureOptionSelectionStates(character, [], absent)
  const state = states.find((state) => state.selection.choiceId === selection.choiceId)!
  expect(state).toMatchObject({ optionalPool: true, recovery: true })
  expect(state.classData).toBeUndefined()
  expect(state.choice).toBeUndefined()
  expect(state.options.map((option) => option.availability)).toEqual(['retained'])
  const empty = makeGameDataFixture()
  const context = createCharacterCalculationContext(character, buildGameDataLookups(empty))
  const issue = validateClassChoices(character, context, createClassChoiceCatalogs(absent)).find(
    (issue) => issue.id === classChoiceReadinessId(selection.choiceId),
  )
  expect(issue?.navigationTarget).toContain('choice=')
  expect(
    projectEffectiveClassChoiceFeatures(character, absent).features.some(
      (feature) => feature.name === row[5],
    ),
  ).toBe(false)
  const keys = selection.selected.map(getClassChoiceOptionKey)
  const unchanged = retainSavedFeatureOptionsCommand(
    character,
    character.provenance,
    selection.choiceId,
    keys,
    { classes: [], catalogs: absent },
    handle,
  )
  expect(unchanged.characterPatch).toEqual({})
  expect(unchanged.provenanceUpdate).toBe(character.provenance)
  expect(() =>
    retainSavedFeatureOptionsCommand(character, character.provenance, selection.choiceId, [], {
      classes: [],
      catalogs: absent,
    }),
  ).toThrow(/changed/)
  expect(() =>
    retainSavedFeatureOptionsCommand(
      character,
      character.provenance,
      selection.choiceId,
      ['invented'],
      { classes: [], catalogs: absent },
      handle,
    ),
  ).toThrow(/retain or remove/)
  const next = {
    ...character,
    classChoiceSelections: character.classChoiceSelections!.map((saved) => ({
      ...saved,
      selected: saved.selected.map((pick) => ({ ...pick, name: 'Changed latest choice' })),
    })),
  }
  expect(() =>
    retainSavedFeatureOptionsCommand(
      next,
      next.provenance,
      selection.choiceId,
      [],
      { classes: [], catalogs: absent },
      handle,
    ),
  ).toThrow(/changed/)
  expect(() =>
    retainSavedFeatureOptionsCommand(
      { ...character, classProgression: [] },
      character.provenance,
      selection.choiceId,
      [],
      { classes: [], catalogs: absent },
      handle,
    ),
  ).toThrow(/owner or slot/)
  const independent = {
    ...character,
    features: [
      ...character.features,
      {
        ...character.features.find((feature) => feature.name === row[5])!,
        id: 'independent-provider',
      },
    ],
  }
  const result = retainSavedFeatureOptionsCommand(
    independent,
    independent.provenance,
    selection.choiceId,
    [],
    { classes: [], catalogs: absent },
    handle,
  )
  const saved = characterPersistenceSchema.parse({
    ...independent,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.optionalClassFeatureAdoptions).toEqual(character.optionalClassFeatureAdoptions)
  expect(saved.classChoiceSelections).toEqual([])
  expect(saved.features.some((feature) => feature.id === 'independent-provider')).toBe(true)
  expect(
    projectEffectiveClassChoiceFeatures(saved, f.catalogs)
      .features.filter((feature) => feature.name === row[5])
      .map((feature) => feature.id),
  ).toEqual(['independent-provider'])
  expect(JSON.stringify(character)).toBe(original)
})
test('native pool partial source-free retention preserves slot annotations without reactivating removed intent', () => {
  const f = makeOptionalPoolRecoveryFixture(optionalPoolRecoveryCases[0])
  const selection = {
    ...f.selection,
    selected: [
      ...f.selection.selected,
      {
        entityType: 'optionalFeature' as const,
        name: 'Transmuted Spell',
        source: 'TCE',
        slotLevel: 3,
      },
    ],
  }
  const actor = { ...f.character, classChoiceSelections: [selection] }
  const result = retainSavedFeatureOptionsCommand(
    actor,
    actor.provenance,
    selection.choiceId,
    [getClassChoiceOptionKey(selection.selected[1])],
    { classes: [], catalogs: absent },
    getOptionalPoolSelectionHandle(selection),
  )
  const saved = characterPersistenceSchema.parse({
    ...actor,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  expect(saved.classChoiceSelections?.[0].selected).toEqual([selection.selected[1]])
  expect(
    projectEffectiveClassChoiceFeatures(saved, f.catalogs).features.map((feature) => feature.name),
  ).toContain('Transmuted Spell')
  expect(
    projectEffectiveClassChoiceFeatures(saved, f.catalogs).features.map((feature) => feature.name),
  ).not.toContain('Seeking Spell')
})
