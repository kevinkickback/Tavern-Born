import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeConditionalCharacterFixture } from '../fixtures/conditionalProficiencyFixtures'

beforeEach(() => {
  resetCharacterStore()
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
  f: ReturnType<typeof makeConditionalCharacterFixture>,
  page: 'class' | 'proficiencies' | 'review',
) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  return render(
    <MemoryRouter initialEntries={[`/build/${page}`]}>
      {page === 'class' ? (
        <BuildClassPage />
      ) : page === 'proficiencies' ? (
        <BuildProficienciesPage />
      ) : (
        <BuildReviewPage />
      )}
    </MemoryRouter>,
  )
}

test('native Runes modal preserves partial setup, strict reopening and qualified note without a new Expertise chooser', async () => {
  const f = makeConditionalCharacterFixture('Fighter', 'XPHB')
  mount(f, 'class')
  const level = (
    await screen.findByText('Level 3', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const group = within(await screen.findByRole('group', { name: 'Runes' }))
  fireEvent.click(group.getByRole('button', { name: 'Choose' }))
  let dialog = within(await screen.findByRole('dialog'))
  fireEvent.change(dialog.getByPlaceholderText('Search available options'), {
    target: { value: 'Fire Rune' },
  })
  fireEvent.click(await dialog.findByText('Fire Rune', { selector: 'span' }))
  dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByText('Confirm', { selector: 'button' }))
  const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
  expect(saved.classChoiceSelections![0].selected).toEqual([
    { entityType: 'optionalFeature', name: 'Fire Rune', source: 'TCE', slotLevel: 3 },
  ])
  expect(deriveConditionalProficiencyNotes(saved, f.catalogs)).toHaveLength(1)
  expect(saved.proficiencies.expertise).toEqual([])
})

test('Proficiencies Sources shows the complete conditional rule without filled Expertise circles and respects suppression', () => {
  const f = makeConditionalCharacterFixture('Fighter', 'XPHB')
  f.character = f.select(['Fire Rune'])
  const note = deriveConditionalProficiencyNotes(f.character, f.catalogs)[0]
  mount(f, 'proficiencies')
  const sources = screen.getByRole('button', { name: /^Sources/ })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(screen.getByText('Conditional proficiency:').parentElement!.textContent).toContain(
    'While wearing or carrying an object inscribed with this rune',
  )
  expect(document.querySelector('[data-expertise-indicator="selected"]')).toBeNull()
  act(() => {
    useCharacterStore.getState().updateCharacter(f.character.id, { suppressedEffectIds: [note.id] })
  })
  expect(screen.queryByText('Conditional proficiency:')).toBeNull()
  act(() => {
    useCharacterStore.getState().updateCharacter(f.character.id, { suppressedEffectIds: [] })
  })
  expect(screen.getByText('Conditional proficiency:')).toBeTruthy()
})

test('Review conditional notes follow source suppression and exact restoration', () => {
  const f = makeConditionalCharacterFixture('Fighter', 'XPHB')
  f.character = f.select(['Fire Rune'])
  const note = deriveConditionalProficiencyNotes(f.character, f.catalogs)[0]
  mount(f, 'review')
  fireEvent.click(screen.getByRole('tab', { name: 'Character overview' }))
  expect(screen.getByText('Conditional notes')).toBeTruthy()
  expect(
    screen.getByText(note.operation.kind === 'conditional-note' ? note.operation.note : ''),
  ).toBeTruthy()
  act(() => {
    useCharacterStore.getState().updateCharacter(f.character.id, { suppressedEffectIds: [note.id] })
  })
  expect(screen.queryByText('Conditional notes')).toBeNull()
  act(() => {
    useCharacterStore.getState().updateCharacter(f.character.id, { suppressedEffectIds: [] })
  })
  expect(screen.getByText('Conditional notes')).toBeTruthy()
})
