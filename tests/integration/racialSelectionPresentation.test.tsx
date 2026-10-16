import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  resolveFeatChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { BuildRacePage } from '@/pages/build/race/RacePage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

// Keep the real picker and selection behavior; jsdom has no virtual-list viewport.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 148,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 148 })),
    measureElement: () => {},
  }),
}))

Element.prototype.scrollIntoView = () => undefined
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined

afterEach(() => {
  cleanup()
  useGameDataStore.setState({ gameData: null })
})

const race = { name: 'Choice Lineage', source: 'TEST', feats: [{ any: 1 }] } as Race5e
const first = { name: 'Training', source: 'BOOK-A', entries: ['First printing'] } as Feat5e
const saved = {
  name: 'Training',
  source: 'BOOK-B',
  entries: ['Saved printing'],
  skillProficiencies: [{ choose: { from: ['arcana', 'survival'], count: 1 } }],
} as Feat5e

function selectedCharacter() {
  let character = buildInitialCharacter(
    {
      initial: {
        name: 'Exact selection',
        originSystem: '2014',
        allowedSources: ['TEST', 'BOOK-A', 'BOOK-B'],
      },
      race,
    },
    new Map(),
    () => [],
  )
  const choice = character.provenance!.choices.find((entry) => entry.domain === 'feats')!
  character = applyCharacterCommandResult(
    character,
    resolveFeatChoiceCommand(character, character.provenance!, choice.id, saved),
  )
  character = applyCharacterCommandResult(
    character,
    commitFeatOptionsCommand(
      character,
      character.provenance!,
      { ...saved, provenanceChoiceId: choice.id },
      { skills: ['Arcana'] },
    ),
  )
  character = applyCharacterCommandResult(
    character,
    replaceBonusFeatSelectionsCommand(character, character.provenance!, [saved]),
  )
  character = applyCharacterCommandResult(
    character,
    commitFeatOptionsCommand(
      character,
      character.provenance!,
      { ...saved, selectionKind: 'bonus' },
      { skills: ['Survival'] },
    ),
  )
  return characterPersistenceSchema.parse(character)
}

function loadData(feats: Feat5e[], parent: Race5e | null = race) {
  const data = makeGameDataFixture({ races: parent ? [parent] : [], feats })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
}

function showPage(character = selectedCharacter()) {
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
    isActiveCharacterDirty: false,
  })
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <BuildRacePage />
      </MemoryRouter>
    </TooltipProvider>,
  )
}

test('exact saved printing is highlighted; opening, Cancel and unchanged Confirm retain configured owners', async () => {
  loadData([first, saved])
  const character = selectedCharacter()
  showPage(character)
  expect(screen.getByText('Training · BOOK-B')).toBeTruthy()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Change' }))
  let dialog = within(screen.getByRole('dialog'))
  expect(dialog.getAllByText('✓')).toHaveLength(1)
  expect(dialog.getByText('Saved printing').closest('[data-index]')?.textContent).toContain('✓')
  await user.click(dialog.getByRole('button', { name: 'Cancel' }))
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Change' }))
  dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByRole('button', { name: 'Confirm' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  expect(
    character.provenance!.choices.find((entry) => entry.domain === 'feats')!.selectedRefs![0]
      .options,
  ).toEqual({ skills: ['Arcana'] })
})

test.each([
  'missing',
  'filtered',
])('a %s saved printing stays visible but is not added to the picker; exact restoration is read-only', async (mode) => {
  const character = selectedCharacter()
  if (mode === 'filtered') character.allowedSources = ['TEST', 'BOOK-A']
  loadData(mode === 'missing' ? [first] : [first, saved])
  showPage(character)
  const user = userEvent.setup()
  expect(screen.getByText('Training · BOOK-B')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Change' }))
  let dialog = within(screen.getByRole('dialog'))
  expect(dialog.queryByText('BOOK-B')).toBeNull()
  expect(dialog.queryByText('✓')).toBeNull()
  expect(dialog.getByText('No selections')).toBeTruthy()
  await user.click(dialog.getByRole('button', { name: 'Cancel' }))
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  if (mode === 'missing') {
    act(() => loadData([first, saved]))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    dialog = within(screen.getByRole('dialog'))
    expect(dialog.getAllByText('✓')).toHaveLength(1)
    await user.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(useCharacterStore.getState().activeCharacter).toBe(character)
  }
})

test('explicit replacement saves the selected printing and preserves independently configured same-target ownership', async () => {
  loadData([first, saved])
  showPage()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Change' }))
  const dialog = within(screen.getByRole('dialog'))
  await user.click(dialog.getByText('First printing'))
  await user.click(dialog.getByRole('button', { name: 'Confirm' }))
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(
    reopened.provenance!.choices.find((entry) => entry.domain === 'feats')!.selectedRefs,
  ).toEqual([{ name: 'Training', source: 'BOOK-A' }])
  expect(reopened.specialFeats![0]).toMatchObject({
    name: 'Training',
    source: 'BOOK-B',
    options: { skills: ['Survival'] },
  })
  expect(reopened.proficiencies.skills).toContain('survival')
  expect(reopened.proficiencies.skills).not.toContain('arcana')
  expect(screen.getByText('Training · BOOK-A')).toBeTruthy()
})

test('saved race and feat labels survive missing parent rules and restoration without writes', async () => {
  loadData([first, saved])
  const character = selectedCharacter()
  showPage(character)
  act(() => loadData([first, saved], null))
  expect(screen.getByRole('heading', { name: 'Choice Lineage' })).toBeTruthy()
  expect(screen.getByText('Training · BOOK-B')).toBeTruthy()
  expect(screen.getByText(/Race rules unavailable/)).toBeTruthy()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Change' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  act(() => loadData([first, saved]))
  expect(screen.getByText('Training · BOOK-B')).toBeTruthy()
  expect(screen.queryByText(/Race rules unavailable/)).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
})

test('parsed full subrace labels show lineage and book while preserving the selected canonical fields', async () => {
  const parent = parseRaces({
    race: [
      {
        name: 'Dragonborn',
        source: 'TEST',
        subraces: [
          {
            name: 'Draconblood',
            source: 'BOOK-A',
            _versions: [{ name: 'Dragonborn (Draconblood; Brass)' }],
          },
        ],
      },
    ],
  })[0] as Race5e
  const child = parent.subraces!.find((entry) => entry._isVersion)!
  const competing = { ...child, source: 'BOOK-B' }
  parent.subraces!.push(competing)
  const character = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: {
          name: 'Lineage',
          originSystem: '2014',
          allowedSources: ['TEST', 'BOOK-A', 'BOOK-B'],
        },
        race: parent,
        subrace: child,
      },
      new Map(),
      () => [],
    ),
  )
  loadData([], parent)
  showPage(character)
  const user = userEvent.setup()
  const selector = screen.getByRole('combobox', { name: 'Subrace' })
  expect(selector.textContent).toBe('Draconblood: Brass · BOOK-A')
  act(() => loadData([], { ...parent, subraces: [competing] }))
  expect(selector.textContent).toBe('Draconblood: Brass · BOOK-A')
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  act(() => loadData([], parent))
  expect(selector.textContent).toBe('Draconblood: Brass · BOOK-A')
  act(() => loadData([], null))
  expect(screen.getByText('Draconblood: Brass · BOOK-A')).toBeTruthy()
  expect(screen.queryByRole('combobox', { name: 'Subrace' })).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  act(() => loadData([], parent))
  const restoredSelector = screen.getByRole('combobox', { name: 'Subrace' })
  expect(restoredSelector.textContent).toBe('Draconblood: Brass · BOOK-A')
  await user.click(restoredSelector)
  await user.click(screen.getByRole('option', { name: 'Draconblood: Brass · BOOK-B' }))
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(reopened.subrace).toBe('Dragonborn (Draconblood; Brass)')
  expect(reopened.subraceSource).toBe('BOOK-B')
})
