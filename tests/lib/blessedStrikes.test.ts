// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  BLESSED_STRIKES_ID,
  IMPROVED_BLESSED_STRIKES_TARGET,
} from '@/lib/5etools/blessedStrikesSource'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const bundled = 'resources/srd/core/data/class/class-cleric.json'
const configured = 'data/class/class-cleric.json'

function setup(path: string) {
  const parsed = parseClassDocument(
    JSON.parse(readFileSync(path, 'utf8')),
    'class/class-cleric.json',
  )
  const data = makeGameDataFixture({
    ...parsed,
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
  })
  const cleric = data.classes.find((row) => row.name === 'Cleric' && row.source === 'XPHB')
  if (!cleric) throw new Error('Revised Cleric is absent')
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const foundChoice = getClassChoiceCandidates(cleric, undefined, catalogs).find(
    (row) => row.id === BLESSED_STRIKES_ID,
  )
  if (!foundChoice) throw new Error('The exact Blessed Strikes choice is absent')
  const choice = foundChoice
  const lookups = {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const actor = createEmptyCharacter({
    name: 'Blessed Strikes Cleric',
    originSystem: '2024',
    allowedSources: ['XPHB'],
    classProgression: [{ name: 'Cleric', source: 'XPHB', levels: 14 }],
  })
  function confirm(
    actor: Character,
    name?: string,
    authority: ClassChoiceFeatureCatalogs = catalogs,
  ) {
    const result = applyClassChoiceSelectionWithGrantsCommand(
      actor,
      actor.provenance,
      choice,
      choice.options.filter((option) => option.name === name),
      { classes: data.classes, catalogs: authority },
    )
    return characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...actor,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }),
      ),
    )
  }
  return { actor, cleric, data, catalogs, choice, confirm, lookups }
}

function verifyChoice(path: string) {
  const { actor, cleric, data, catalogs, choice, confirm, lookups } = setup(path)
  const rules = createClassChoiceCatalogs(catalogs)
  expect(resolveClassChoiceOptions(choice, rules, [], 7).map((row) => row.reference.name)).toEqual([
    'Divine Strike',
    'Potent Spellcasting',
  ])
  expect(
    validateClassChoices(actor, createCharacterCalculationContext(actor, lookups), rules),
  ).toContainEqual(expect.objectContaining({ title: 'Finish Blessed Strikes' }))
  const divine = confirm(actor, 'Divine Strike')
  const selection = divine.classChoiceSelections?.find((row) => row.choiceId === BLESSED_STRIKES_ID)
  if (!selection) throw new Error('Blessed Strikes did not persist')
  expect(selection.selected[0].slotLevel).toBe(7)
  const invalid = structuredClone(divine)
  invalid.classChoiceSelections?.push(selection)
  expect(characterPersistenceSchema.safeParse(invalid).success).toBe(false)
  const projected = projectEffectiveClassChoiceFeatures(divine, catalogs)
  expect(projected.features.find((row) => row.name === 'Divine Strike')?.description).toContain(
    '2d8',
  )
  expect(projected.features.some((row) => row.name === 'Potent Spellcasting')).toBe(false)
  const lowered = { ...divine, classProgression: [{ name: 'Cleric', source: 'XPHB', levels: 13 }] }
  expect(
    projectEffectiveClassChoiceFeatures(lowered, catalogs).features.find(
      (row) => row.name === 'Divine Strike',
    )?.description,
  ).not.toContain('2d8')
  const upgradeLost = {
    ...catalogs,
    classFeatureCandidates: new Map(catalogs.classFeatureCandidates),
  }
  upgradeLost.classFeatureCandidates.delete(IMPROVED_BLESSED_STRIKES_TARGET)
  expect(
    projectEffectiveClassChoiceFeatures(divine, upgradeLost).features.find(
      (row) => row.name === 'Divine Strike',
    )?.description,
  ).toContain('1d8')
  expect(
    projectEffectiveClassChoiceFeatures(divine, upgradeLost).features.find(
      (row) => row.name === 'Divine Strike',
    )?.description,
  ).not.toContain('2d8')

  const potent = confirm(divine, 'Potent Spellcasting')
  const view = createCharacterSheetViewModel(potent, lookups, lookups)
  expect(view.classFeaturesSummary2014).toContain('twice your Wisdom modifier')
  expect(view.classFeaturesSummary2014).not.toContain('extra damage of your Divine Strike')
  const activity = createOptionalClassFeatureActivity(potent, catalogs)
  const improved = activity.entries(
    ['class', 'cleric', 'xphb'],
    IMPROVED_BLESSED_STRIKES_TARGET,
    [],
  )
  expect(JSON.stringify(improved)).toContain('Potent Spellcasting')
  expect(JSON.stringify(improved)).not.toContain('Divine Strike')
  expect(
    confirm(potent).classChoiceSelections?.some((row) => row.choiceId === BLESSED_STRIKES_ID),
  ).toBeFalsy()

  const unavailable = { ...catalogs, classFeatureCandidates: new Map() }
  expect(() => confirm(divine, 'Potent Spellcasting', unavailable)).toThrow('source rules changed')
  expect(
    projectEffectiveClassChoiceFeatures(divine, unavailable).features.some(
      (row) => row.name === 'Divine Strike',
    ),
  ).toBe(false)
  expect(
    getFeatureOptionSelectionStates(divine, catalogs.classes ?? [], unavailable),
  ).toContainEqual(expect.objectContaining({ recovery: true, blessedStrikes: true }))
  expect(
    projectEffectiveClassChoiceFeatures(divine, catalogs).features.some(
      (row) => row.name === 'Divine Strike',
    ),
  ).toBe(true)
  const strike = catalogs.classFeatures.find(
    (row) => row.name === 'Divine Strike' && row.source === 'XPHB',
  )
  const strikeTarget = strike && getClassFeatureIdentity(strike)
  if (!strike || !strikeTarget) throw new Error('The exact Divine Strike producer is absent')
  const conflicting = {
    ...catalogs,
    classFeatureCandidates: new Map(catalogs.classFeatureCandidates),
  }
  conflicting.classFeatureCandidates.set(strikeTarget, [
    { ...strike, additionalSpells: [{ known: { '7': ['guidance|xphb'] } }] },
  ])
  expect(
    projectEffectiveClassChoiceFeatures(divine, conflicting).features.some(
      (row) => row.name === 'Divine Strike',
    ),
  ).toBe(false)
  const unexpectedGain = {
    ...catalogs,
    classes: [
      {
        ...cleric,
        classFeatures: [
          ...(cleric.classFeatures ?? []).filter((row): row is string => typeof row === 'string'),
          'Divine Strike|Cleric|XPHB|7',
        ],
      },
    ],
  }
  expect(getClassChoiceCandidates(cleric, undefined, unexpectedGain)).not.toContainEqual(
    expect.objectContaining({ id: choice.id }),
  )
  const withoutRoot = {
    ...data,
    classFeatures: data.classFeatures.filter(
      (row) => row.name !== 'Blessed Strikes' || row.source !== 'XPHB',
    ),
  }
  expect(
    buildRetainedCharacterDetails(divine, withoutRoot, data).choiceDetailsById.get(choice.id),
  ).toEqual([
    {
      availability: 'missing',
      entries: ['Restore the exact Blessed Strikes source or remove the saved choice.'],
    },
  ])
  expect(
    buildRetainedCharacterDetails(divine, data, data).choiceDetailsById.get(choice.id),
  ).toEqual([{ availability: 'available', entries: [] }])
  const clear = retainSavedFeatureOptionsCommand(
    divine,
    divine.provenance,
    choice.id,
    [],
    { classes: catalogs.classes ?? [], catalogs: unavailable },
    getOptionalPoolSelectionHandle(selection),
  )
  expect(
    clear.characterPatch.classChoiceSelections?.some((row) => row.choiceId === choice.id),
  ).toBeFalsy()
}

test('projects the selected bundled Blessed Strikes branch through commands and the sheet', () => {
  verifyChoice(bundled)
})

test.skipIf(!existsSync(configured))(
  'uses the same rules with the configured Cleric source',
  () => {
    verifyChoice(configured)
  },
)
