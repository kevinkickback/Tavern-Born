import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeFavoredEnemyFixture, selectFavoredEnemy } from '../fixtures/favoredEnemyFixtures'

beforeEach(() => {
  resetCharacterStore()
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
const active = () => useCharacterStore.getState().activeCharacter!
function mount(f: ReturnType<typeof makeFavoredEnemyFixture>, c = f.character) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(c)
  return render(
    <MemoryRouter initialEntries={['/build/review']}>
      <Routes>
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/build/class" element={<BuildClassPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const dialog = () => within(screen.getByRole('dialog'))
async function select(label: string, value: string) {
  fireEvent.click(dialog().getByRole('combobox', { name: label }))
  fireEvent.click(await screen.findByRole('option', { name: value }))
}
async function confirm() {
  fireEvent.click(dialog().getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}
async function open() {
  const group = await screen.findByRole('group', { name: 'Favored Enemy' })
  fireEvent.click(
    within(group).getByRole('button', { name: /^(Choose|Edit|Review saved choice)$/ }),
  )
  await screen.findByRole('dialog')
}
test('Review routes to shared compound setup; save partial, confirm pair/language, Cancel, strict reopen and Clear', async () => {
  const f = makeFavoredEnemyFixture(1)
  mount(f)
  fireEvent.click(screen.getByText('Finish Favored Enemy').closest('button')!)
  await screen.findByRole('dialog')
  await select('Enemy selection', 'Two humanoid races')
  await confirm()
  expect(active().classChoiceSelections![0]).toMatchObject({
    selected: [],
    favoredEnemy: { mode: 'humanoid-races' },
  })
  const before = JSON.stringify(active())
  await open()
  fireEvent.change(dialog().getByLabelText('Humanoid race 1'), { target: { value: 'Gnoll' } })
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  expect(JSON.stringify(active())).toBe(before)
  await open()
  fireEvent.change(dialog().getByLabelText('Humanoid race 1'), { target: { value: 'Gnoll' } })
  fireEvent.change(dialog().getByLabelText('Humanoid race 2'), { target: { value: 'Orc' } })
  fireEvent.click(dialog().getByRole('checkbox', { name: /two distinct humanoid races/ }))
  await select('Associated language', 'Common')
  fireEvent.click(dialog().getByRole('checkbox', { name: /this language is spoken/ }))
  await confirm()
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(saved.classChoiceSelections![0].favoredEnemy).toEqual({
    mode: 'humanoid-races',
    humanoidsConfirmed: true,
    language: { kind: 'spoken', name: 'common' },
  })
  expect(saved.proficiencies.languages).toContain('common')
  expect(screen.getByRole('group', { name: 'Favored Enemy' }).textContent).toContain('1 / 1 chosen')
  await open()
  await select('Enemy selection', 'One creature type')
  await select('Creature type', 'Beast')
  await confirm()
  expect(active().classChoiceSelections![0].favoredEnemy).toEqual({ mode: 'type' })
  expect(active().proficiencies.languages).not.toContain('common')
  expect(screen.getByRole('group', { name: 'Favored Enemy' }).textContent).toContain('0 / 1 chosen')
  await open()
  fireEvent.click(dialog().getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().classChoiceSelections).toEqual([])
})
test('source-unavailable intent has targeted recovery, exact restoration without a write, and source-free Clear', async () => {
  const f = makeFavoredEnemyFixture(1),
    saved = selectFavoredEnemy(f)
  const missing = makeFavoredEnemyFixture(1, (d) => {
    d.classFeature = d.classFeature.filter(
      (x) => !(x.name === 'Favored Enemy' && x.source === 'PHB'),
    )
  })
  mount(missing, saved)
  fireEvent.click(screen.getByText('Restore or remove Favored Enemy').closest('button')!)
  await screen.findByRole('dialog')
  expect(dialog().queryByRole('button', { name: 'Confirm' })).toBeNull()
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  const before = JSON.stringify(active())
  await act(async () => useGameDataStore.setState({ gameData: f.data }))
  expect(JSON.stringify(active())).toBe(before)
  await act(async () => useGameDataStore.setState({ gameData: missing.data }))
  await open()
  fireEvent.click(dialog().getByRole('button', { name: 'Clear' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().classChoiceSelections).toEqual([])
  expect(active().proficiencies.languages).not.toContain('common')
})
