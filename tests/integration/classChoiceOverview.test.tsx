import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { normalizeClassChoices } from '@/lib/5etools/classChoiceNormalization'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'

beforeEach(resetCharacterStore)
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
  vi.restoreAllMocks()
})

test('Overview derives passive adopted roots/earned children and suspends them without mutating saved features', async () => {
  const { data, catalogs } = makeOptionalClassSourceData()
  let character = createEmptyCharacter({
    name: 'Adopted Ranger',
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 10 }],
  })
  character = {
    ...character,
    allowedSources: ['PHB', 'TCE'],
    variantRules: { optionalClassFeatures: true },
  }
  for (const root of OPTIONAL_CLASS_FEATURE_RULES.roots) {
    const result = setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      catalogs,
      { owner: root.owner, target: root.target, earnedLevel: root.level },
      true,
      [],
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  const before = JSON.stringify(character)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <BuildReviewPage />
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByText('Traits & features'))
  const section = within(screen.getByText('Class, subclass & other features').closest('section')!)
  expect(section.getByText('Favored Foe')).toBeTruthy()
  expect(section.getByText('Spellcasting Focus')).toBeTruthy()
  expect(section.getByText('Roving')).toBeTruthy()
  expect(section.getByText('Tireless')).toBeTruthy()
  act(() => setActiveCharacter({ ...character, variantRules: { optionalClassFeatures: false } }))
  expect(section.queryByText('Favored Foe')).toBeNull()
  expect(section.queryByText('Spellcasting Focus')).toBeNull()
  act(() => setActiveCharacter(character))
  expect(section.getByText('Favored Foe')).toBeTruthy()
  expect(character.features).toEqual([])
  expect(JSON.stringify(character)).toBe(before)
})

test('Overview renders and removes independently selected same-label complete feature targets', async () => {
  const targets = ['Wizard', 'Bard'].map((className) => ({
    name: 'Beacon',
    source: 'PHB',
    className,
    classSource: 'PHB',
    level: 1,
    entries: [`${className} beacon rules.`],
  }))
  const descriptor = normalizeClassChoices({ name: 'Wizard', source: 'PHB' }, [
    {
      ref: 'Training|Wizard||1',
      name: 'Training',
      className: 'Wizard',
      feature: {
        ...targets[0],
        name: 'Training',
        entries: [
          {
            type: 'options',
            count: 2,
            entries: targets.map((target) => ({
              type: 'refClassFeature',
              classFeature: `Beacon|${target.className}||1`,
            })),
          },
        ],
      },
    },
  ]).choices[0]
  let character = createEmptyCharacter({
    name: 'Current Beacon',
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
  })
  const apply = (options: typeof descriptor.options) => {
    const transition = applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance!,
      descriptor,
      options,
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...transition.characterPatch,
      provenance: transition.provenanceUpdate,
    })
  }
  apply(descriptor.options)
  const data = makeGameDataFixture({
    classes: [makeClassFixture({ classFeatureRefs: [] })],
    classFeatures: targets,
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  const errors = vi.spyOn(console, 'error')
  render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <BuildReviewPage />
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByText('Traits & features'))
  const section = within(screen.getByText('Feature choices').closest('section')!)
  expect(section.getAllByText('Beacon (PHB)')).toHaveLength(2)
  expect(section.getByText('Wizard beacon rules.')).toBeTruthy()
  expect(section.getByText('Bard beacon rules.')).toBeTruthy()
  expect(section.queryByText('Unresolved source')).toBeNull()
  apply([descriptor.options[1]])
  act(() => setActiveCharacter(character))
  expect(section.getAllByText('Beacon (PHB)')).toHaveLength(1)
  expect(section.queryByText('Wizard beacon rules.')).toBeNull()
  expect(section.getByText('Bard beacon rules.')).toBeTruthy()
  expect(
    errors.mock.calls.filter((call) => call.some((value) => /same key/i.test(String(value)))),
  ).toEqual([])
})
