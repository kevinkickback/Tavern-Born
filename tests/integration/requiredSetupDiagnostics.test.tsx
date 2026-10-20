import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useClassChoiceFeatureCatalogs } from '@/hooks/character/useClassChoiceFeatureCatalogs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument, parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { optionalClassSources } from '../fixtures/optionalClassFeatureFixtures'
import { dragonSetupDocument } from '../fixtures/requiredSetupFixtures'

beforeEach(() => {
  resetCharacterStore()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
const emptyCatalogs = {
  creatures: [],
  feats: [],
  items: [],
  itemsBase: [],
  itemMasteries: [],
  optionalFeatures: [],
}
function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname + location.search}</output>
}
function dragonContext(level = 3, revisedOwner = true) {
  const classes = parseClasses(dragonSetupDocument(revisedOwner)) as Class5e[]
  const data = makeGameDataFixture({
    classes,
    classFeatures: parseClassFeatures(dragonSetupDocument(revisedOwner)) as ClassFeature[],
  })
  data.lookups = buildGameDataLookups(data)
  const character = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        makeCharacterFixture({
          name: 'Copied dragon setup',
          originSystem: revisedOwner ? '2024' : '2014',
          allowedSources: ['PHB', 'XPHB'],
          classProgression: [
            {
              name: 'Sorcerer',
              source: classes[0].source,
              levels: level,
              subclass: 'Draconic Bloodline',
              subclassSource: 'PHB',
            },
          ],
        }),
      ),
    ),
  )
  return { classes, data, character }
}

test('Review navigates to the offered shared ancestry selector at the earned level without changing the save', async () => {
  const { data, character } = dragonContext(1, false)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  const saved = JSON.stringify(useCharacterStore.getState().activeCharacter)
  render(
    <MemoryRouter initialEntries={['/build/review']}>
      <LocationProbe />
      <Routes>
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const issue = screen.getByText('Finish Dragon Ancestor').closest('button')!
  expect(issue).toBeTruthy()
  fireEvent.click(issue)
  const route = screen.getByLabelText('Current route').textContent!
  expect(route).toContain('/build/class')
  expect(await screen.findByRole('heading', { name: 'Choose Dragon Ancestor' })).toBeTruthy()
  expect(screen.queryByText(/requires a dragon ancestry choice/)).toBeNull()
  expect(screen.queryByText(/could not safely determine its options or count/)).toBeNull()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const card = screen.getByRole('group', { name: 'Subclass' })
  await waitFor(() => expect(card.className).toContain('animate-route-focus'))
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(saved)
})

test('readiness and the class controller agree across level, subclass removal, restoration and strict reopen', () => {
  const { classes, data, character } = dragonContext(2)
  const catalogs = { ...emptyCatalogs, ...buildClassChoiceFeatureCatalogs(data) }
  const { result, rerender } = renderHook(
    ({ current }) =>
      useClassChoiceController({
        character: current,
        viewingClassData: classes[0],
        viewingSubclassData: classes[0].subclasses![0],
        viewingClassLevel: current.classProgression[0].levels,
        catalogs,
      }),
    { initialProps: { current: character } },
  )
  expect(result.current.diagnostics).toEqual([])
  const check = (current: typeof character) =>
    validateClassChoices(
      current,
      createCharacterCalculationContext(current, { classesByKey: { 'Sorcerer|XPHB': classes[0] } }),
    ).filter((issue) => issue.title === 'Finish Dragon Ancestor')
  const leveled = characterPersistenceSchema.parse({
    ...character,
    classProgression: [{ ...character.classProgression[0], levels: 3 }],
  })
  rerender({ current: leveled })
  expect(result.current.diagnostics).toHaveLength(0)
  expect(result.current.choices).toMatchObject([{ label: 'Dragon Ancestor', level: 3 }])
  expect(check(leveled)).toHaveLength(1)
  const removed = characterPersistenceSchema.parse({
    ...leveled,
    classProgression: [
      { ...leveled.classProgression[0], subclass: undefined, subclassSource: undefined },
    ],
  })
  expect(check(removed)).toEqual([])
  expect(check(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(leveled))))).toHaveLength(
    1,
  )
})

function rangerSource(document = structuredClone(optionalClassSources)) {
  const parsed = parseClassDocument(document)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
  })
  data.lookups = buildGameDataLookups(data)
  return data
}
function adoptedRanger(data: ReturnType<typeof rangerSource>) {
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  let character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 1 }],
    variantRules: { optionalClassFeatures: true },
  })
  expect(character.optionalClassFeatureAdoptions ?? []).toEqual([])
  for (const name of ['deft explorer', 'favored foe']) {
    const result = setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      catalogs,
      {
        owner: ['class', 'ranger', 'phb'],
        target: `class-feature|${name}|ranger|phb|1|tce`,
        earnedLevel: 1,
      },
      true,
      [],
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  return character
}

test('class controller, Builder and readiness share filtered optional replacement decisions through refresh', async () => {
  const data = rangerSource(),
    character = adoptedRanger(data)
  const cls = data.classes.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(character)
  const saved = JSON.stringify(useCharacterStore.getState().activeCharacter)
  const filteredProbe = renderHook(() => useClassChoiceFeatureCatalogs())
  expect(filteredProbe.result.current.classFeatures.length).toBeGreaterThan(4)
  const currentCatalog = (available: ClassFeature[]) => ({
    ...emptyCatalogs,
    ...buildClassChoiceFeatureCatalogs({ ...data, classFeatures: available }),
  })
  const { result, rerender } = renderHook(
    ({ available }) =>
      useClassChoiceController({
        character,
        viewingClassData: cls,
        viewingClassLevel: 1,
        includeClassFeatureVariants: true,
        catalogs: currentCatalog(available),
      }),
    { initialProps: { available: data.classFeatures } },
  )
  const readiness = (available: ClassFeature[]) => {
    const catalogs = currentCatalog(available)
    return validateClassChoices(
      character,
      createCharacterCalculationContext(character, {
        classesByKey: data.lookups!.classesByKey,
        classChoiceClasses: data.classes,
        classChoiceFeatureCatalogs: catalogs,
      }),
      { ...catalogs, itemPropertyByAbbr: {}, itemTypeByAbbr: {}, weaponProficiencies: [] },
    )
  }
  expect(result.current.diagnostics).toEqual([])
  expect(
    result.current.choices.filter((row) => row.kind === 'proficiency').map((row) => row.label),
  ).toEqual(['Canny expertise', 'Canny languages'])
  expect(
    readiness(data.classFeatures).filter((row) => row.title.startsWith('Restore or clear')),
  ).toEqual([])
  rerender({ available: [] })
  expect(result.current.choices.filter((row) => row.kind === 'proficiency')).toEqual([])
  expect(
    readiness([])
      .filter((row) => row.title.startsWith('Restore or clear'))
      .map((row) => row.title)
      .sort(),
  ).toEqual(['Restore or clear Deft Explorer', 'Restore or clear Favored Foe'])
  rerender({ available: data.classFeatures })
  render(
    <MemoryRouter initialEntries={['/build/class?class=Ranger%7CPHB&level=1']}>
      <BuildClassPage />
    </MemoryRouter>,
  )
  if (!screen.queryByRole('group', { name: 'Canny expertise' }))
    fireEvent.click(screen.getByRole('button', { name: /^Level 1\b/ }))
  expect(screen.getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Canny languages' })).toBeTruthy()
  await act(async () => {
    useGameDataStore.setState({
      gameData: {
        ...data,
        classFeatures: [],
        lookups: buildGameDataLookups({ ...data, classFeatures: [] }),
      },
    })
  })
  expect(filteredProbe.result.current.classFeatures).toEqual([])
  expect(screen.queryByRole('group', { name: 'Canny expertise' })).toBeNull()
  expect(screen.getAllByText(/Source unavailable/)).toHaveLength(2)
  expect(screen.queryByText(/requires enemy and associated language/)).toBeNull()
  expect(screen.queryByText(/favored-terrain rules/)).toBeNull()
  await act(async () => {
    useGameDataStore.setState({ gameData: data })
  })
  expect(screen.getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(saved)
})

test.each([
  'Favored Foe',
  'Deft Explorer',
])('production Review and Builder preserve %s ambiguity through exact restoration', async (name) => {
  const doc = structuredClone(optionalClassSources)
  const original = doc.classFeature.find((row) => row.name === name && row.source === 'TCE')!
  const duplicateDoc = {
    ...doc,
    classFeature: [
      ...doc.classFeature,
      {
        ...original,
        name: name.toUpperCase(),
        className: ' RANGER ',
        classSource: '',
        source: ' tce ',
        entries: ['Conflicting source rules.'],
      },
    ],
  }
  const exact = rangerSource(doc),
    ambiguous = rangerSource(duplicateDoc),
    character = adoptedRanger(exact)
  useGameDataStore.setState({ gameData: ambiguous })
  setActiveCharacter(character)
  const saved = JSON.stringify(useCharacterStore.getState().activeCharacter)
  render(
    <MemoryRouter initialEntries={['/build/review']}>
      <Routes>
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText(`Restore or clear ${name}`)).toBeTruthy()
  await act(async () => {
    useGameDataStore.setState({ gameData: exact })
  })
  expect(screen.queryByText(`Restore or clear ${name}`)).toBeNull()
  fireEvent.click(screen.getByText('Finish Canny expertise').closest('button')!)
  expect(await screen.findByRole('heading', { name: 'Choose Canny expertise' })).toBeTruthy()
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel', { selector: 'button' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await act(async () => {
    useGameDataStore.setState({ gameData: ambiguous })
  })
  expect(screen.getByText(/Source unavailable/)).toBeTruthy()
  if (name === 'Deft Explorer')
    expect(screen.queryByRole('group', { name: 'Canny expertise' })).toBeNull()
  await act(async () => {
    useGameDataStore.setState({ gameData: exact })
  })
  expect(screen.queryByText(/Source unavailable/)).toBeNull()
  expect(screen.getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(saved)
})

test('source-free recovery levels keep each adopted replacement independently clearable', async () => {
  const data = rangerSource(),
    character = adoptedRanger(data)
  character.features = [
    {
      id: 'manual:independent',
      name: 'Independent',
      source: 'PHB',
      description: 'Keep this feature.',
    },
  ]
  const absent = {
    ...data,
    classFeatures: [],
    lookups: buildGameDataLookups({ ...data, classFeatures: [] }),
  }
  useGameDataStore.setState({ gameData: absent })
  setActiveCharacter(character)
  render(
    <MemoryRouter initialEntries={['/build/class?class=Ranger%7CPHB&level=1']}>
      <BuildClassPage />
    </MemoryRouter>,
  )
  const trigger = (
    await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (trigger.getAttribute('data-state') === 'closed') fireEvent.click(trigger)
  expect(screen.getAllByText(/Source unavailable/)).toHaveLength(2)
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Natural Explorer' }), {
    button: 0,
    ctrlKey: false,
  })
  let saved = useCharacterStore.getState().activeCharacter!
  expect(saved.optionalClassFeatureAdoptions?.map((row) => row.target)).toEqual([
    'class-feature|favored foe|ranger|phb|1|tce',
  ])
  expect(saved.features).toEqual(character.features)
  expect(screen.getAllByText(/Source unavailable/)).toHaveLength(1)
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Favored Enemy' }), {
    button: 0,
    ctrlKey: false,
  })
  saved = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(saved.optionalClassFeatureAdoptions).toEqual([])
  expect(saved.features).toEqual(character.features)
  const before = JSON.stringify(saved)
  await act(async () => {
    useGameDataStore.setState({ gameData: data })
  })
  expect(useCharacterStore.getState().activeCharacter?.optionalClassFeatureAdoptions).toEqual([])
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
})
