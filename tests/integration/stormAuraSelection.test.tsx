import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeStormAuraFixture, selectStormAura } from '../fixtures/stormAuraFixtures'

import { installStormSourceDouble } from '../fixtures/stormAuraSourceDouble'

beforeEach(() => {
  installStormSourceDouble()
  resetCharacterStore()
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 100
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
function mount(
  fixture: ReturnType<typeof makeStormAuraFixture>,
  saved = fixture.character,
  route = '/build/class',
) {
  useGameDataStore.setState({ gameData: fixture.data })
  setActiveCharacter(saved)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
        <Route path="/build/review" element={<BuildReviewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const active = () => useCharacterStore.getState().activeCharacter!
const dialog = () => within(screen.getByRole('dialog'))
async function open() {
  if (!screen.queryByRole('group', { name: 'Storm Aura' })) {
    const level = await screen.findByRole('button', { name: /Level 3\b/ })
    if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  }
  const card = await screen.findByRole('group', { name: 'Storm Aura' })
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
  await screen.findByRole('dialog')
}
function row(name: string) {
  fireEvent.change(dialog().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return dialog().findByRole('button', { name: new RegExp('^' + name + '\\b') })
}
async function confirm() {
  fireEvent.click(dialog().getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

test('Review chooses a real Storm child through the shared modal and strict reopen', async () => {
  const f = makeStormAuraFixture()
  mount(f, f.character, '/build/review')
  fireEvent.click(screen.getByText('Finish Storm Aura').closest('button')!)
  await screen.findByRole('dialog')
  fireEvent.click(await row('Sea'))
  await confirm()
  expect(active().classChoiceSelections![0].selected).toEqual([
    {
      entityType: 'subclassFeature',
      name: 'Sea',
      source: 'XGE',
      ref: 'sea|barbarian|phb|storm herald|xge|3|xge',
      slotLevel: 3,
    },
  ])
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(reopened.classChoiceSelections).toEqual(active().classChoiceSelections)
  expect(reopened.classChoiceSelections![0].choiceId).toBe(
    selectStormAura(f).classChoiceSelections![0].choiceId,
  )
})
test('reopened Storm choice keeps unchanged confirmation and Cancel clean', async () => {
  const f = makeStormAuraFixture()
  mount(f, selectStormAura(f))
  const before = JSON.stringify(active())
  await open()
  await confirm()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await open()
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  expect(JSON.stringify(active())).toBe(before)
})
test('replacement and Clear preserve independent features', async () => {
  const f = makeStormAuraFixture()
  mount(f, selectStormAura(f))
  await open()
  fireEvent.click(await row('Sea'))
  fireEvent.click(await row('Desert'))
  await confirm()
  expect(active().classChoiceSelections![0].selected[0].name).toBe('Desert')
  await open()
  fireEvent.click(await row('Desert'))
  await confirm()
  expect(active().classChoiceSelections).toEqual([])
  expect(active().features).toEqual(f.character.features)
})
test('fully pruned source uses shared saved recovery and restores without changing intent', async () => {
  const f = makeStormAuraFixture()
  const saved = selectStormAura(f)
  const missing = makeStormAuraFixture(3, 'PHB', (doc) => {
    doc.subclassFeature = doc.subclassFeature.filter((row) => row.name !== 'Storm Aura')
    doc.subclassFeature.find((row) => row.name === 'Path of the Storm Herald')!.entries = []
  })
  mount(missing, saved, '/build/review')
  const before = JSON.stringify(active())
  fireEvent.click(screen.getByText('Restore or remove Storm Aura').closest('button')!)
  await screen.findByRole('dialog')
  expect(dialog().getByRole('heading', { name: 'Review saved Storm Aura' })).toBeTruthy()
  await confirm()
  expect(JSON.stringify(active())).toBe(before)
  await act(async () => {
    await useGameDataStore.setState({ gameData: f.data })
  })
  expect(screen.queryByText('Restore or remove Storm Aura')).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
})
test('an open picker rechecks changed source before accepting a stale option', async () => {
  const f = makeStormAuraFixture()
  mount(f, selectStormAura(f))
  await open()
  fireEvent.click(await row('Sea'))
  fireEvent.click(await row('Desert'))
  const changed = makeStormAuraFixture(3, 'PHB', (doc) => {
    doc.subclassFeature = doc.subclassFeature.filter(
      (row) => !(row.name === 'Desert' && row.level === 3),
    )
  })
  await act(async () => {
    await useGameDataStore.setState({ gameData: changed.data })
  })
  const button = dialog().getByRole('button', { name: 'Confirm' })
  if (!button.hasAttribute('disabled')) fireEvent.click(button)
  expect(active().classChoiceSelections![0].selected[0].name).toBe('Sea')
})

test.each([
  'subclass',
  'class',
])('missing entire %s catalog keeps shared recovery and safe Clear', async (kind) => {
  const f = makeStormAuraFixture()
  const saved = selectStormAura(f)
  const missing = makeStormAuraFixture()
  missing.data.classes =
    kind === 'class'
      ? []
      : missing.data.classes.map((cls) => ({
          ...cls,
          subclasses: cls.subclasses?.filter((sub) => sub.shortName !== 'Storm Herald'),
        }))
  mount(missing, saved, '/build/review')
  fireEvent.click(screen.getByText('Restore or remove Storm Aura').closest('button')!)
  await screen.findByRole('dialog')
  expect(dialog().getByRole('heading', { name: 'Review saved Storm Aura' })).toBeTruthy()
  const bytes = JSON.stringify(active())
  await confirm()
  expect(JSON.stringify(active())).toBe(bytes)
  const card = await screen.findByRole('group', { name: 'Storm Aura' })
  fireEvent.click(within(card).getByRole('button', { name: 'Review saved choice' }))
  await screen.findByRole('dialog')
  fireEvent.click(await row('Sea'))
  await confirm()
  expect(active().classChoiceSelections).toEqual([])
  expect(active().features).toEqual(f.character.features)
})
