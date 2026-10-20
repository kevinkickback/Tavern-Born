import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeOptionalClassSectionData } from '../fixtures/optionalClassSectionFixtures'

beforeEach(() => {
  resetCharacterStore()
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

test('Class adopts source-backed Fighting Style Options, uses the existing picker, and reopens book details', async () => {
  const { data } = makeOptionalClassSectionData()
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(
    makeCharacterFixture({
      allowedSources: ['PHB', 'TCE'],
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
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
    await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (trigger.getAttribute('data-state') === 'closed') fireEvent.click(trigger)
  const section = within(screen.getByRole('region', { name: 'Optional class features' }))
  const checkbox = section.getByRole('checkbox', {
    name: /Fighting Style Options/,
  }) as HTMLInputElement
  expect(checkbox.checked).toBe(false)
  const details = section.getByRole('button', { name: 'Fighting Style Options' })
  expect(section.getAllByRole('button', { name: 'Fighting Style Options' })).toHaveLength(1)
  const beforePreview = JSON.stringify(useCharacterStore.getState().activeCharacter)
  fireEvent.click(details)
  expect(await screen.findByRole('heading', { name: 'Fighting Style Options' })).toBeDefined()
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(beforePreview)
  expect(checkbox.checked).toBe(false)
  fireEvent.click(checkbox)
  await waitFor(() =>
    expect(useCharacterStore.getState().activeCharacter?.optionalClassFeatureAdoptions).toEqual([
      { owner: ['class', 'fighter', 'phb'], target: 'book-section|tce|0dc', earnedLevel: 1 },
    ]),
  )
  expect(section.getAllByRole('button', { name: 'Fighting Style Options' })).toHaveLength(1)
  const selectedBeforeDetails = JSON.stringify(useCharacterStore.getState().activeCharacter)
  fireEvent.click(section.getByRole('button', { name: 'Fighting Style Options' }))
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(selectedBeforeDetails)
  expect(checkbox.checked).toBe(true)
  expect(await screen.findByRole('heading', { name: 'Fighting Style Options' })).toBeDefined()
  expect(screen.getAllByText(/Interception/).length).toBeGreaterThan(0)
  const saved = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(saved.features.some((row) => row.name === 'Fighting Style Options')).toBe(false)
  const choose = screen
    .getAllByRole('button')
    .find(
      (button) =>
        /Choose Fighting Style|Choose/.test(button.textContent ?? '') &&
        button.closest('[data-state="open"]'),
    )
  expect(choose).toBeDefined()
  fireEvent.click(choose!)
  const dialog = within(await screen.findByRole('dialog'))
  fireEvent.change(dialog.getByPlaceholderText('Search available options'), {
    target: { value: 'Interception' },
  })
  fireEvent.click(await dialog.findByRole('button', { name: /^Interception\b/ }))
  const confirm = dialog.getByText('Confirm', { selector: 'button' })
  fireEvent.click(within(confirm.parentElement!).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const selected = useCharacterStore.getState().activeCharacter!
  expect(selected.features.some((row) => row.name === 'Interception')).toBe(true)
  expect(
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(selected)))
      .classChoiceSelections?.[0].selected,
  ).toMatchObject([{ name: 'Interception', source: 'TCE' }])
  fireEvent.click(section.getByRole('checkbox', { name: /Fighting Style Options/ }))
  await waitFor(() =>
    expect(
      useCharacterStore
        .getState()
        .activeCharacter?.features.some((row) => row.name === 'Interception'),
    ).toBe(false),
  )
  expect(useCharacterStore.getState().activeCharacter?.classChoiceSelections).toEqual(
    selected.classChoiceSelections,
  )
})
