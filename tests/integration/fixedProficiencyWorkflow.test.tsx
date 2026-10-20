import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeFixedCharacterFixture } from '../fixtures/fixedProficiencyFixtures'

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
function mount(f: ReturnType<typeof makeFixedCharacterFixture>, page: 'class' | 'proficiencies') {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  return render(
    <MemoryRouter initialEntries={[`/build/${page}`]}>
      {page === 'class' ? <BuildClassPage /> : <BuildProficienciesPage />}
    </MemoryRouter>,
  )
}
test('actual Scout fixed circles are filled and locked, Sources records subclass ownership, source loss and restoration update read-only display', () => {
  const f = makeFixedCharacterFixture()
  mount(f, 'proficiencies')
  for (const name of ['Nature', 'Survival']) {
    const row = screen.getByLabelText(`${name} proficiency`, { selector: 'fieldset' })
    const circle = within(row).getByRole('button', {
      name: new RegExp('expertise.*' + name + '$', 'i'),
    })
    expect(circle.querySelector('[data-expertise-indicator="selected"]')).toBeTruthy()
    // Another source may spend its own Rogue choice, but the fixed source offers no removal action.
    expect(circle.getAttribute('aria-label')).not.toMatch(/^Remove expertise/)
  }
  const sources = screen.getByRole('button', { name: /^Sources/ })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  const expertiseSources = within(screen.getByText('Expertise:').parentElement!)
  expect(expertiseSources.getByText('(subclass)')).toBeTruthy()
  expect(screen.getByText('Expertise:').parentElement!.textContent).toMatch(/nature.*survival/i)
  expect(useCharacterStore.getState().activeCharacter!.proficiencies.expertise).toEqual([])
  act(() => {
    useCharacterStore.getState().updateCharacter(f.character.id, { allowedSources: ['PHB'] })
  })
  expect(
    screen
      .getByLabelText('Nature proficiency', { selector: 'fieldset' })
      .querySelector('[data-expertise-indicator="selected"]'),
  ).toBeNull()
  act(() => {
    useCharacterStore
      .getState()
      .updateCharacter(f.character.id, { allowedSources: f.character.allowedSources })
  })
  expect(
    screen
      .getByLabelText('Nature proficiency', { selector: 'fieldset' })
      .querySelector('[data-expertise-indicator="selected"]'),
  ).toBeTruthy()
})
test('actual Banneret Class confirms history, uses the shared fallback modal and retains setup after clearing', async () => {
  const f = makeFixedCharacterFixture('Fighter')
  mount(f, 'class')
  const level = (
    await screen.findByText('Level 7', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const card = within(screen.getByLabelText('Royal Envoy skills', { selector: 'fieldset' }))
  fireEvent.click(card.getByRole('button', { name: 'Confirm setup' }))
  let dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText(/When you gained this feature/)).toBeTruthy()
  fireEvent.click(dialog.getByRole('button', { name: 'Already proficient in Persuasion' }))
  dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText(/Acquisition setup/)).toBeTruthy()
  fireEvent.change(dialog.getByPlaceholderText('Search available options'), {
    target: { value: 'Insight' },
  })
  fireEvent.click(await dialog.findByText('Insight', { selector: 'span' }))
  fireEvent.click(dialog.getByText('Confirm', { selector: 'button' }))
  const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
  expect(saved.classChoiceSelections![0].proficiencyAtGain?.alreadyProficient).toBe(true)
  expect(saved.proficiencies.expertise).toEqual(['persuasion'])
  expect(saved.proficiencies.skills).toContain('insight')
  fireEvent.click(card.getByRole('button', { name: 'Edit' }))
  dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: 'Correct setup' }))
  dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: 'Gained Persuasion from this feature' }))
  const corrected = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
  expect(corrected.classChoiceSelections![0].selected).toEqual([])
  expect(corrected.proficiencies.skills).toEqual(['persuasion'])
  expect(
    within(screen.getByLabelText('Royal Envoy skills', { selector: 'fieldset' })).getByText(
      'Proficiency setup confirmed',
    ),
  ).toBeTruthy()
})
