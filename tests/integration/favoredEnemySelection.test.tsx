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
  fireEvent.mouseDown(dialog().getByRole('tab', { name: 'Two humanoid races' }), {
    button: 0,
    ctrlKey: false,
  })
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
  await select('Associated language', 'Common')
  expect(dialog().queryByRole('checkbox')).toBeNull()
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
  fireEvent.mouseDown(dialog().getByRole('tab', { name: 'One creature type' }), {
    button: 0,
    ctrlKey: false,
  })
  fireEvent.change(dialog().getByLabelText('Creature type'), { target: { value: 'Beast' } })
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

test('autocomplete, single suggestion, Show all and saved-language preservation use the actual Class command', async () => {
  const f = makeFavoredEnemyFixture(1)
  f.data.creatures = [
    { name: 'Speech fixture', source: 'MM', type: { type: 'dragon' }, languages: ['Draconic'] },
    { name: 'Disabled source fixture', source: 'FTD', type: 'dragon', languages: ['Common'] },
  ]
  f.data.races = [
    { name: 'Elf', source: 'PHB', languageProficiencies: [{ common: true, elvish: true }] },
  ]
  mount(f)
  fireEvent.click(screen.getByText('Finish Favored Enemy').closest('button')!)
  await screen.findByRole('dialog')
  const before = JSON.stringify(active())
  const type = dialog().getByRole('combobox', { name: 'Creature type' })
  expect(document.getElementById(type.getAttribute('list')!)?.textContent).toContain('Dragon')
  fireEvent.change(type, { target: { value: 'Dra' } })
  expect((dialog().getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.change(type, { target: { value: 'Dragon' } })
  expect(dialog().getByRole('combobox', { name: 'Associated language' }).textContent).toContain(
    'Draconic',
  )
  expect(JSON.stringify(active())).toBe(before)
  fireEvent.click(dialog().getByRole('combobox', { name: 'Associated language' }))
  expect(screen.queryByRole('option', { name: 'Common' })).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: 'Draconic' }))
  fireEvent.click(dialog().getByRole('button', { name: 'Show all languages' }))
  await select('Associated language', 'Elvish')
  await confirm()
  expect(characterPersistenceSchema.parse(active()).classChoiceSelections![0].favoredEnemy).toEqual(
    { mode: 'type', language: { kind: 'spoken', name: 'elvish' } },
  )
  await open()
  expect(dialog().getByRole('combobox', { name: 'Associated language' }).textContent).toContain(
    'Elvish',
  )
  const saved = JSON.stringify(active())
  await act(async () => useGameDataStore.setState({ gameData: { ...f.data, creatures: [] } }))
  expect(dialog().getByRole('combobox', { name: 'Associated language' }).textContent).toContain(
    'Elvish',
  )
  expect(JSON.stringify(active())).toBe(saved)
  fireEvent.mouseDown(dialog().getByRole('tab', { name: 'Two humanoid races' }), {
    button: 0,
    ctrlKey: false,
  })
  const race = dialog().getByLabelText('Humanoid race 1')
  expect(document.getElementById(race.getAttribute('list')!)?.textContent).toContain('Elf (PHB)')
  fireEvent.change(race, { target: { value: 'Elf' } })
  fireEvent.change(dialog().getByLabelText('Humanoid race 2'), {
    target: { value: 'Campaign people' },
  })
  expect(dialog().getByRole('combobox', { name: 'Associated language' }).textContent).toContain(
    'Decide later',
  )
  fireEvent.click(dialog().getByRole('combobox', { name: 'Associated language' }))
  expect(screen.getByRole('option', { name: 'Common' })).toBeTruthy()
  expect(screen.getByRole('option', { name: 'Elvish' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'Draconic' })).toBeNull()
  fireEvent.click(screen.getByRole('option', { name: 'Common' }))
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  expect(JSON.stringify(active())).toBe(saved)
})
