import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getClassChoiceDeclaration } from '@/lib/character/classChoiceIdentity'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeOptionalDeclarationCatalog } from '../fixtures/optionalClassDeclarationFixtures'

beforeEach(() => {
  resetCharacterStore()
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})

test('independent same-name subclass setup and unsupported diagnostic remain outside class-owned tabs', async () => {
  const { data } = makeOptionalDeclarationCatalog(
    'class/class-ranger.json',
    ['class', 'ranger', 'phb'],
    (document) => {
      document.subclass.push({
        name: 'Navigator',
        shortName: 'Navigator',
        source: 'HB',
        className: 'Ranger',
        classSource: 'PHB',
        subclassFeatures: ["Nature's Veil|Ranger||Navigator|HB|10|TCE"],
      })
      document.subclassFeature.push({
        name: "Nature's Veil",
        source: 'TCE',
        className: 'Ranger',
        classSource: 'PHB',
        subclassShortName: 'Navigator',
        subclassSource: 'HB',
        level: 10,
        entries: [1, 0].map((count) => ({
          type: 'options',
          count,
          entries: [{ type: 'refClassFeature', classFeature: 'Favored Enemy|Ranger||1' }],
        })),
      })
    },
  )
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(
    makeCharacterFixture({
      allowedSources: ['PHB', 'TCE', 'HB'],
      classProgression: [
        { name: 'Ranger', source: 'PHB', levels: 10, subclass: 'Navigator', subclassSource: 'HB' },
      ],
      variantRules: { optionalClassFeatures: true },
      optionalClassFeatureAdoptions: [
        {
          owner: ['class', 'ranger', 'phb'],
          target: "class-feature|nature's veil|ranger|phb|10|tce",
          earnedLevel: 10,
        },
      ],
    }),
  )
  render(
    <MemoryRouter initialEntries={['/build/class']}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const trigger = await screen.findByRole('button', { name: /^Level 10,/ })
  if (trigger.getAttribute('data-state') === 'closed') fireEvent.click(trigger)
  const panel = screen.getByRole('tabpanel', { name: /^Nature's Veil/ })
  const independent = screen.getByRole('group', { name: "Nature's Veil 1" })
  expect(within(independent).getByRole('button', { name: 'Choose' })).toBeTruthy()
  expect(panel.contains(independent)).toBe(false)
  const diagnostic = within(screen.getByRole('region', { name: /^Level 10,/ })).getByText(
    /No rule was guessed/,
  )
  expect(panel.contains(diagnostic)).toBe(false)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
test('actual Class page offers only the selected subclass replacement and restores its exact standard side', async () => {
  const owner: ['subclass', string, string, string, string] = [
    'subclass',
    'cleric',
    'phb',
    'life domain',
    'phb',
  ]
  const { data } = makeOptionalDeclarationCatalog('class/class-cleric.json', owner)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(
    makeCharacterFixture({
      allowedSources: ['PHB', 'TCE'],
      classProgression: [
        {
          name: 'Cleric',
          source: 'PHB',
          levels: 8,
          subclass: 'Life Domain',
          subclassSource: 'PHB',
        },
      ],
      variantRules: { optionalClassFeatures: true },
    }),
  )
  render(
    <MemoryRouter initialEntries={['/build/class']}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const trigger = (
    await screen.findByText('Level 8', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (trigger.getAttribute('data-state') === 'closed') fireEvent.click(trigger)
  const optional = (await screen.findByRole('tab', {
    name: /Blessed Strikes/,
  })) as HTMLInputElement
  const standard = screen.getByRole('tab', { name: /^Divine Strike/ }) as HTMLInputElement
  expect(optional.getAttribute('aria-selected')).toBe('false')
  expect(standard.getAttribute('aria-selected')).toBe('true')
  expect(screen.getAllByRole('tab', { name: /Blessed Strikes/ })).toHaveLength(1)
  fireEvent.mouseDown(optional, { button: 0, ctrlKey: false })
  const target = 'subclass-feature|blessed strikes|cleric|phb|life|phb|8|tce'
  await waitFor(() =>
    expect(useCharacterStore.getState().activeCharacter?.optionalClassFeatureAdoptions).toEqual([
      { owner, target, earnedLevel: 8 },
    ]),
  )
  expect(screen.queryByRole('button', { name: 'View Blessed Strikes' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Blessed Strikes' }))
  expect(await screen.findByRole('heading', { name: 'Blessed Strikes' })).toBeDefined()
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(reopened.features.some((row) => row.name === 'Blessed Strikes')).toBe(false)
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Divine Strike/ }), {
    button: 0,
    ctrlKey: false,
  })
  await waitFor(() =>
    expect(useCharacterStore.getState().activeCharacter?.optionalClassFeatureAdoptions).toEqual([]),
  )
  expect(
    (screen.getByRole('tab', { name: /^Divine Strike/ }) as HTMLElement).getAttribute(
      'aria-selected',
    ),
  ).toBe('true')
})

test.each([
  'PHB',
  'XPHB',
] as const)('%s companion selection preserves current-side setup under its source policy', async (source) => {
  const owner: ['subclass', string, string, string, string] = [
    'subclass',
    'ranger',
    source.toLowerCase(),
    'beast master',
    'phb',
  ]
  const fixture = makeOptionalDeclarationCatalog('class/class-ranger.json', owner)
  const cls = fixture.data.classes.find((row) => row.name === 'Ranger' && row.source === source)!
  const subclass = cls.subclasses!.find(
    (row) => row.name === 'Beast Master' && row.source === 'PHB',
  )!
  useGameDataStore.setState({ gameData: fixture.data })
  setActiveCharacter(
    makeCharacterFixture({
      originSystem: source === 'XPHB' ? '2024' : '2014',
      allowedSources: ['PHB', 'XPHB', 'TCE'],
      classProgression: [
        { name: 'Ranger', source, levels: 3, subclass: 'Beast Master', subclassSource: 'PHB' },
      ],
      variantRules: { optionalClassFeatures: true },
    }),
  )
  const active = () => useCharacterStore.getState().activeCharacter!
  const currentChoices = (character = active()) =>
    getCharacterClassChoices(
      cls,
      subclass,
      createOptionalClassFeatureActivity(character, fixture.catalogs),
      fixture.catalogs,
    )
  const standardChoice = currentChoices().find((row) => row.label === "Ranger's Companion")!
  const target = "subclass-feature|ranger's companion|ranger|phb|beast master|phb|3|phb"
  expect(getClassChoiceDeclaration(standardChoice)?.target).toBe(target)
  // Actual owner XPHB may legitimately inherit the original PHB UID.
  for (const conflict of [
    { ...standardChoice, owner: { ...standardChoice.owner, featureName: 'Other feature' } },
    { ...standardChoice, owner: { ...standardChoice.owner, featureSource: 'TCE' } },
    { ...standardChoice, level: 4 },
    {
      ...standardChoice,
      source: { ...standardChoice.source, field: 'classFeatureRefs::entries.filter' },
    },
  ])
    expect(createOptionalClassFeatureActivity(active(), fixture.catalogs).choice(conflict)).toBe(
      false,
    )
  render(
    <MemoryRouter initialEntries={['/build/class']}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const level = await screen.findByRole('button', { name: /^Level 3,/ })
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  if (source === 'XPHB') {
    // Current 2024 page policy filters replaced legacy subclasses. A complete-catalog
    // copied-UID activity positive does not authorize showing that filtered page route.
    expect(screen.queryByRole('tab', { name: /^Primal Companion/ })).toBeNull()
    const request = {
      owner,
      target: 'subclass-feature|primal companion|ranger|phb|beast master|phb|3|tce',
      earnedLevel: 3,
    }
    const original = active()
    const result = setOptionalClassAdoptionCommand(
      original,
      original.provenance,
      fixture.catalogs,
      request,
      true,
      getOptionalClassFamilyKeys(original, request),
    )
    const adopted = { ...original, ...result.characterPatch, provenance: result.provenanceUpdate }
    expect(currentChoices(adopted).map((row) => row.label)).toContain('Primal Companion')
    expect(currentChoices(adopted).map((row) => row.label)).not.toContain("Ranger's Companion")
    expect(() =>
      applyClassChoiceSelectionCommand(adopted, standardChoice, [], {
        classes: fixture.data.classes,
        catalogs: fixture.catalogs,
      }),
    ).toThrow(/not active/)
    const cleared = setOptionalClassAdoptionCommand(
      adopted,
      adopted.provenance,
      fixture.catalogs,
      request,
      false,
      getOptionalClassFamilyKeys(adopted, request),
    )
    const restored = { ...adopted, ...cleared.characterPatch, provenance: cleared.provenanceUpdate }
    expect(currentChoices(restored).map((row) => row.label)).toContain("Ranger's Companion")
    expect(() =>
      applyClassChoiceSelectionCommand(restored, standardChoice, [], {
        classes: fixture.data.classes,
        catalogs: fixture.catalogs,
      }),
    ).not.toThrow()
    return
  }
  const standard = () => screen.getByRole('tab', { name: /^Ranger's Companion/ })
  const optional = () => screen.getByRole('tab', { name: /^Primal Companion/ })
  const standardPanel = screen.getByRole('tabpanel', { name: /^Ranger's Companion/ })
  expect(within(standardPanel).getByRole('group', { name: "Ranger's Companion" })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Choose Ranger's Companion/ })).toBeNull()
  fireEvent.keyDown(optional(), { key: 'Enter' })
  const panel = await screen.findByRole('tabpanel', { name: /^Primal Companion/ })
  expect(within(panel).getByRole('group', { name: 'Primal Companion' })).toBeTruthy()
  expect(screen.queryByRole('group', { name: "Ranger's Companion" })).toBeNull()
  expect(currentChoices().map((row) => row.label)).toContain('Primal Companion')
  expect(currentChoices().map((row) => row.label)).not.toContain("Ranger's Companion")
  // One companion allocation plus the independent spell gain at this PHB level.
  expect(within(level).getByText('2 pending choices', { exact: true })).toBeTruthy()
  expect(() =>
    applyClassChoiceSelectionCommand(active(), standardChoice, [], {
      classes: fixture.data.classes,
      catalogs: fixture.catalogs,
    }),
  ).toThrow(/not active/)
  await act(() => {
    setActiveCharacter(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active()))))
  })
  expect(screen.getByRole('tab', { name: /^Primal Companion/ }).getAttribute('aria-selected')).toBe(
    'true',
  )
  await act(() => {
    useCharacterStore
      .getState()
      .updateCharacter(active().id, { variantRules: { optionalClassFeatures: false } })
  })
  expect(currentChoices().map((row) => row.label)).toContain("Ranger's Companion")
  expect(screen.queryByRole('tab', { name: /^Primal Companion/ })).toBeNull()
  await act(() => {
    useCharacterStore
      .getState()
      .updateCharacter(active().id, { variantRules: { optionalClassFeatures: true } })
  })
  expect(
    within(screen.getByRole('tabpanel', { name: /^Primal Companion/ })).getByRole('group', {
      name: 'Primal Companion',
    }),
  ).toBeTruthy()
  const missing = makeOptionalDeclarationCatalog('class/class-ranger.json', owner, (document) => {
    document.subclassFeature = document.subclassFeature.filter(
      (row) => !(row.name === 'Primal Companion' && row.source === 'TCE'),
    )
  })
  const before = JSON.stringify(active())
  await act(() => {
    useGameDataStore.setState({ gameData: missing.data })
  })
  expect(await screen.findByText(/^Source unavailable\. Restore/)).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Primal Companion' })).toBeNull()
  expect(screen.queryByRole('group', { name: "Ranger's Companion" })).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
  await act(() => {
    useGameDataStore.setState({ gameData: fixture.data })
  })
  expect(
    within(await screen.findByRole('tabpanel', { name: /^Primal Companion/ })).getByRole('group', {
      name: 'Primal Companion',
    }),
  ).toBeTruthy()
  expect(JSON.stringify(active())).toBe(before)
  fireEvent.keyDown(standard(), { key: 'Enter' })
  expect(
    within(await screen.findByRole('tabpanel', { name: /^Ranger's Companion/ })).getByRole(
      'group',
      { name: "Ranger's Companion" },
    ),
  ).toBeTruthy()
  expect(currentChoices().map((row) => row.label)).not.toContain('Primal Companion')
  expect(() =>
    applyClassChoiceSelectionCommand(active(), standardChoice, [], {
      classes: fixture.data.classes,
      catalogs: fixture.catalogs,
    }),
  ).not.toThrow()
})
