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
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useClassChoiceFeatureCatalogs } from '@/hooks/character/useClassChoiceFeatureCatalogs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
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
import { dragonSetupDocument, rangerSetupDocument } from '../fixtures/requiredSetupFixtures'

beforeEach(resetCharacterStore)
afterEach(() => {
  cleanup()
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
  const card = screen.getByRole('group', { name: 'Dragon Ancestor' })
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

test('class controller, Builder and readiness share filtered optional replacement decisions through refresh', async () => {
  const doc = rangerSetupDocument(),
    classes = parseClasses(doc) as Class5e[],
    features = parseClassFeatures(doc) as ClassFeature[]
  const data = makeGameDataFixture({ classes, classFeatures: features })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  const character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: 1 }],
    variantRules: { optionalClassFeatures: true },
  })
  setActiveCharacter(character)
  const saved = JSON.stringify(useCharacterStore.getState().activeCharacter)
  const filteredProbe = renderHook(() => useClassChoiceFeatureCatalogs())
  expect(filteredProbe.result.current.classFeatures).toHaveLength(4)
  const { result, rerender } = renderHook(
    ({ available }) =>
      useClassChoiceController({
        character,
        viewingClassData: classes[0],
        viewingClassLevel: 1,
        includeClassFeatureVariants: true,
        catalogs: { ...emptyCatalogs, classFeatures: available, subclassFeatures: [] },
      }),
    { initialProps: { available: features } },
  )
  const readiness = (available: ClassFeature[]) =>
    validateClassChoices(
      character,
      createCharacterCalculationContext(character, { classesByKey: { 'Ranger|PHB': classes[0] } }),
      {
        ...emptyCatalogs,
        classFeatures: available,
        subclassFeatures: [],
        itemPropertyByAbbr: {},
        itemTypeByAbbr: {},
        weaponProficiencies: [],
      },
    ).filter((issue) => issue.id.startsWith('class-choice-diagnostic:'))
  expect(result.current.diagnostics.map((d) => d.featureName)).toEqual(['Deft Explorer'])
  expect(readiness(features).map((issue) => issue.title)).toEqual([
    'Review unresolved Deft Explorer choice',
  ])
  rerender({ available: [] })
  expect(result.current.diagnostics.map((d) => d.featureName).sort()).toEqual([
    'Favored Enemy',
    'Natural Explorer',
  ])
  expect(readiness([])).toHaveLength(2)
  rerender({ available: features })
  expect(result.current.diagnostics.map((d) => d.featureName)).toEqual(['Deft Explorer'])
  render(
    <MemoryRouter initialEntries={['/build/class?class=Ranger%7CPHB&level=1']}>
      <BuildClassPage />
    </MemoryRouter>,
  )
  if (!screen.queryByText(/requires Canny expertise/))
    fireEvent.click(screen.getByRole('button', { name: /^Level 1 Features/ }))
  expect(screen.getAllByText(/requires Canny expertise/)).toHaveLength(1)
  await act(async () =>
    useGameDataStore.setState({
      gameData: {
        ...data,
        classFeatures: [],
        lookups: buildGameDataLookups({ ...data, classFeatures: [] }),
      },
    }),
  )
  expect(filteredProbe.result.current.classFeatures).toEqual([])
  expect(screen.queryByText(/requires Canny expertise/)).toBeNull()
  expect(screen.getByText(/requires enemy and associated language/)).toBeTruthy()
  expect(screen.getByText(/requires favored terrain/)).toBeTruthy()
  await act(async () => useGameDataStore.setState({ gameData: data }))
  expect(screen.getAllByText(/requires Canny expertise/)).toHaveLength(1)
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(saved)
})

test.each([
  'Favored Foe',
  'Deft Explorer',
])('production Review and Builder preserve %s ambiguity through exact restoration', async (name) => {
  const doc = rangerSetupDocument(),
    original = doc.classFeature.find((feature) => feature!.name === name)!
  const duplicateDoc = {
    ...doc,
    classFeature: [
      ...doc.classFeature,
      {
        ...original,
        name: original.name.toUpperCase(),
        className: ' RANGER ',
        classSource: '',
        source: ' tce ',
        entries: ['Conflicting source rules.'],
      },
    ],
  }
  const makeData = (document: typeof doc) => {
    const data = makeGameDataFixture({
      classes: parseClasses(document) as Class5e[],
      classFeatures: parseClassFeatures(document) as ClassFeature[],
    })
    data.lookups = buildGameDataLookups(data)
    return data
  }
  const ambiguous = makeData(duplicateDoc),
    exact = makeData(doc)
  useGameDataStore.setState({ gameData: ambiguous })
  const character = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        makeCharacterFixture({
          allowedSources: ['PHB', 'TCE'],
          classProgression: [{ name: 'Ranger', source: 'PHB', levels: 1 }],
          variantRules: { optionalClassFeatures: true },
        }),
      ),
    ),
  )
  setActiveCharacter(character)
  const saved = JSON.stringify(useCharacterStore.getState().activeCharacter)
  const base = name === 'Favored Foe' ? 'Favored Enemy' : 'Natural Explorer'
  const body =
    name === 'Favored Foe' ? /requires enemy and associated language/ : /requires favored terrain/
  render(
    <MemoryRouter initialEntries={['/build/review']}>
      <Routes>
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByText(`Review unresolved ${base} choice`)).toBeTruthy()
  if (name === 'Deft Explorer')
    expect(screen.queryByText('Review unresolved Deft Explorer choice')).toBeNull()
  await act(async () => useGameDataStore.setState({ gameData: exact }))
  expect(screen.queryByText(`Review unresolved ${base} choice`)).toBeNull()
  fireEvent.click(screen.getByText('Review unresolved Deft Explorer choice').closest('button')!)
  expect(await screen.findByText(/requires Canny expertise/)).toBeTruthy()
  await act(async () => useGameDataStore.setState({ gameData: ambiguous }))
  expect(screen.getByText(body)).toBeTruthy()
  if (name === 'Deft Explorer') expect(screen.queryByText(/requires Canny expertise/)).toBeNull()
  await act(async () => useGameDataStore.setState({ gameData: exact }))
  expect(screen.queryByText(body)).toBeNull()
  expect(screen.getAllByText(/requires Canny expertise/)).toHaveLength(1)
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(saved)
})
