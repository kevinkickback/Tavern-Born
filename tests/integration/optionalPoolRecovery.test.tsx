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
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import {
  makeOptionalPoolRecoveryFixture,
  optionalPoolRecoveryCases,
} from '../fixtures/optionalPoolRecoveryFixtures'

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
test.each([
  0, 3,
])('actual Class source-free pool recovery %s keeps saved IDs then clears without resurrection', async (index) => {
  const f = makeOptionalPoolRecoveryFixture(optionalPoolRecoveryCases[index])
  const absent = makeGameDataFixture()
  absent.lookups = buildGameDataLookups(absent)
  useGameDataStore.setState({ gameData: absent })
  setActiveCharacter(f.character)
  const params = new URLSearchParams({
    class: `${f.character.classProgression[0].name}|PHB`,
    choice: f.choice.id,
    level: String(f.choice.level),
  })
  render(
    <MemoryRouter initialEntries={[`/build/class?${params}`]}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
  const active = () => useCharacterStore.getState().activeCharacter!
  const before = JSON.stringify(active())
  let dialog = within(await screen.findByRole('dialog'))
  expect(dialog.getByRole('heading', { name: `Review saved ${f.choice.label}` })).toBeDefined()
  expect(dialog.getByText(/Keep or remove saved choices/)).toBeDefined()
  const selected = dialog.getByRole('button', {
    name: new RegExp(`^${f.selection.selected[0].name}`),
  })
  expect(selected.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(dialog.getByText('Confirm', { selector: 'button' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(JSON.stringify(active())).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: 'Review saved choice' }))
  dialog = within(await screen.findByRole('dialog'))
  fireEvent.click(
    dialog.getByRole('button', { name: new RegExp(`^${f.selection.selected[0].name}`) }),
  )
  fireEvent.click(dialog.getByText('Confirm', { selector: 'button' }))
  await waitFor(() => expect(active().classChoiceSelections).toEqual([]))
  expect(characterPersistenceSchema.safeParse(active()).success).toBe(true)
  await act(() => {
    useGameDataStore.setState({ gameData: f.data })
  })
  expect(active().features.some((feature) => feature.name === f.selection.selected[0].name)).toBe(
    false,
  )
  expect(active().optionalClassFeatureAdoptions).toEqual(f.character.optionalClassFeatureAdoptions)
})
test('a saved pool removal handle cannot erase a newly replaced selection or another active character', async () => {
  const f = makeOptionalPoolRecoveryFixture(optionalPoolRecoveryCases[0])
  useGameDataStore.setState({ gameData: makeGameDataFixture() })
  setActiveCharacter(f.character)
  const { result } = renderHook(() => useClassProvenanceMutations())
  const stale = result.current.retainSavedFeatureOptions
  const expected = getOptionalPoolSelectionHandle(f.selection)
  await act(() => {
    useCharacterStore.setState({
      activeCharacter: {
        ...f.character,
        classChoiceSelections: [
          { ...f.selection, selected: [{ ...f.selection.selected[0], name: 'Transmuted Spell' }] },
        ],
      },
    })
  })
  expect(() => stale(f.choice.id, [], expected)).toThrow(/changed/)
  expect(
    useCharacterStore.getState().activeCharacter?.classChoiceSelections?.[0].selected[0].name,
  ).toBe('Transmuted Spell')
  await act(() => {
    useCharacterStore.setState({ activeCharacter: { ...f.character, id: 'other-character' } })
  })
  expect(() => stale(f.choice.id, [], expected)).toThrow(/active character changed/)
})
