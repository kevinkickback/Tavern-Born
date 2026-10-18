import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import {
  makeFeatureOptionFixture,
  pruneFeatureOptionDeclaration,
  selectFeatureOption,
} from '../fixtures/featureOptionFixtures'

beforeEach(() => {
  resetCharacterStore()
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  // jsdom has no layout; preserve the real shared modal and give its virtual viewport geometry.
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
  fixture: ReturnType<typeof makeFeatureOptionFixture>,
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
const card = () =>
  screen.queryByRole('group', { name: 'Dragon Ancestor' }) ??
  screen.getByRole('group', { name: 'Sorcerous Origin' })
const dialog = () => within(screen.getByRole('dialog'))
async function showCard() {
  if (
    !screen.queryByRole('group', { name: 'Dragon Ancestor' }) &&
    !screen.queryByRole('group', { name: 'Sorcerous Origin' })
  ) {
    const level = await screen.findByRole('button', { name: /Level 1 Features/ })
    if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  }
  return card()
}
async function open(label = 'Edit') {
  await showCard()
  const parent = card()
  fireEvent.click(
    within(parent).getByRole('button', {
      name:
        parent.getAttribute('aria-label') === 'Sorcerous Origin'
          ? `${label} Dragon Ancestor`
          : label,
    }),
  )
  await screen.findByRole('dialog')
}
async function row(name: string) {
  fireEvent.change(dialog().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return dialog().findByRole('button', { name: new RegExp(`^${name}\\b`) })
}
async function confirm() {
  fireEvent.click(dialog().getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

test('Review chooses ancestry through the real shared selector and strictly reopens the same owner, target and slot', async () => {
  const fixture = makeFeatureOptionFixture()
  const view = mount(fixture, fixture.character, '/build/review')
  fireEvent.click(screen.getByText('Finish Dragon Ancestor').closest('button')!)
  await screen.findByRole('dialog')
  const before = JSON.stringify(active())
  fireEvent.click(await row('Red'))
  expect(dialog().getByText('Damage type: Fire')).toBeTruthy()
  await confirm()
  expect(active().classChoiceSelections?.[0].selected.map((value) => value.name)).toEqual(['Red'])
  expect(active().features).toEqual(fixture.character.features)
  expect(JSON.stringify(active())).not.toBe(before)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(reopened.classChoiceSelections).toEqual(active().classChoiceSelections)
  expect(reopened.classChoiceSelections).toEqual(selectFeatureOption(fixture).classChoiceSelections)
  view.unmount()
})

test('strictly reopened ancestry preserves unchanged confirmation and immediately reopens the saved selection', async () => {
  const fixture = makeFeatureOptionFixture()
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(selectFeatureOption(fixture))),
  )
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  mount(fixture, reopened)
  const bytes = JSON.stringify(active())
  await open()
  await confirm()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await open()
  expect(dialog().getByRole('heading', { name: 'Choose Dragon Ancestor' })).toBeTruthy()
  expect(dialog().getByText(/^1\/1 /)).toBeTruthy()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test('strictly reopened ancestry cancels a draft removal without changing saved state', async () => {
  const fixture = makeFeatureOptionFixture()
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(selectFeatureOption(fixture))),
  )
  mount(fixture, reopened)
  const bytes = JSON.stringify(active())
  await open()
  fireEvent.click(await row('Red'))
  expect(dialog().getByText(/^0\/1 /)).toBeTruthy()
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(active().features).toEqual(reopened.features)
})

test('strictly reopened ancestry supports replacement and Clear while preserving independent features', async () => {
  const fixture = makeFeatureOptionFixture()
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(selectFeatureOption(fixture))),
  )
  mount(fixture, reopened)
  await open()
  fireEvent.click(await row('Red'))
  fireEvent.click(await row('Blue'))
  await confirm()
  expect(active().classChoiceSelections?.[0].selected.map((value) => value.name)).toEqual(['Blue'])
  await open()
  fireEvent.click(await row('Blue'))
  await confirm()
  expect(active().classChoiceSelections ?? []).toEqual([])
  expect(active().features).toEqual(fixture.character.features)
})

test('fully pruned source routes to shared removal-only recovery; unchanged and Cancel preserve saved bytes, exact restoration and explicit Clear work', async () => {
  const fixture = makeFeatureOptionFixture()
  const saved = selectFeatureOption(fixture)
  const missing = makeFeatureOptionFixture(1, pruneFeatureOptionDeclaration)
  const view = mount(missing, saved, '/build/review')
  const bytes = JSON.stringify(active())
  fireEvent.click(screen.getByText('Restore or remove Dragon Ancestor').closest('button')!)
  await screen.findByRole('dialog')
  expect(dialog().getByRole('heading', { name: 'Review saved Dragon Ancestor' })).toBeTruthy()
  expect(dialog().getByText(/Keep or remove saved choices/)).toBeTruthy()
  expect(dialog().queryByText('1 / 1')).toBeNull()
  await confirm()
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-warning',
  )
  await open('Review saved choice')
  fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
  expect(JSON.stringify(active())).toBe(bytes)
  await act(async () => {
    await useGameDataStore.setState({ gameData: fixture.data })
  })
  await showCard()
  expect(within(card()).getByRole('button', { name: 'Edit Dragon Ancestor' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Sorcerous Origin' }).className).toContain(
    'border-success',
  )
  expect(JSON.stringify(active())).toBe(bytes)
  await act(async () => {
    await useGameDataStore.setState({ gameData: missing.data })
  })
  await open('Review saved choice')
  fireEvent.click(await row('Red'))
  await confirm()
  expect(active().classChoiceSelections ?? []).toEqual([])
  expect(active().features).toEqual(saved.features)
  view.unmount()
})

test('a source refresh while a choice is open cannot confirm a newly stale row', async () => {
  const fixture = makeFeatureOptionFixture()
  mount(fixture)
  const bytes = JSON.stringify(active())
  await open('Choose')
  fireEvent.click(await row('Red'))
  const changed = makeFeatureOptionFixture(1, (document) => {
    const source = document.subclassFeature.find(
      (value) => value.name === 'Dragon Ancestor' && value.source === 'PHB',
    )!
    const table = source.entries!.find(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        (value as { type?: string }).type === 'table',
    ) as { rows: string[][] }
    table.rows = table.rows.filter((value) => value[0] !== 'Red')
  })
  await act(async () => {
    await useGameDataStore.setState({ gameData: changed.data })
  })
  await waitFor(() =>
    expect(dialog().getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(true),
  )
  expect(JSON.stringify(active())).toBe(bytes)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})
