import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { ManagedClassSpellsDialog } from '@/pages/build/class/components/ManagedClassSpellsDialog'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'

const fixture = makeManagedClassSpellFixtures()
const gameData = { ...fixture.data, spells: fixture.spells }
gameData.lookups = buildGameDataLookups(gameData)
const initial = () =>
  makeCharacterFixture({
    allowedSources: ['PHB'],
    classProgression: [{ name: 'Bard', source: 'PHB', levels: 1 }],
  })
const install = (character: Character) => {
  useGameDataStore.setState({ gameData })
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
}
function Flow() {
  const character = useCharacterStore((state) => state.activeCharacter)!
  const calculation = useCharacterCalculationContext(character)
  const { finishClassSpellChoices } = useSpellProvenanceMutations()
  const [open, setOpen] = useState(true)
  return open ? (
    <ManagedClassSpellsDialog
      character={character}
      entry={character.classProgression[0]}
      level={1}
      context={calculation?.classChoices.spellContext}
      statuses={calculation?.managedClassSpellStatuses ?? []}
      onOpenChange={setOpen}
      onFinish={finishClassSpellChoices}
    />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      Reopen spell choices
    </button>
  )
}
async function choose(index: number, name: string) {
  const group = screen.getByRole('group', { name: `Cantrip ${index}` })
  fireEvent.click(within(group).getByRole('button', { name: /Choose|Change/ }))
  fireEvent.change(screen.getByRole('textbox', { name: /Search/ }), { target: { value: name } })
  await waitFor(() => expect(screen.getByText(name)).toBeTruthy())
  fireEvent.click(screen.getByText(name))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy())
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 160
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useGameDataStore.setState({ gameData: null })
  useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null, characters: [] })
})

describe('Class spell Finish and current-state adapter', () => {
  test('Spells Sources shows a current fixed subclass grant once', async () => {
    const saved = makeCharacterFixture({
      allowedSources: ['PHB'],
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
          subclassSource: 'PHB',
        },
      ],
    })
    install(saved)
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SpellsPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Rogue/ }))
    const sources = screen.getByRole('button', { name: /^Sources/ })
    expect(sources.textContent).toBe('Sources1')
    if (sources.getAttribute('data-state') !== 'open') fireEvent.click(sources)
    const section = sources.closest('[data-slot="accordion-item"]') as HTMLElement
    expect(within(section).getAllByText('Mage Hand (PHB)')).toHaveLength(1)
    expect(useCharacterStore.getState().activeCharacter).toBe(saved)
  })

  test('Spells recovery clears an exact dormant I without a saved parent profile', async () => {
    const original = initial()
    const selected = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    const projected = projectManagedClassSpellState(
      { ...original, ...selected.characterPatch, provenance: selected.provenanceUpdate },
      { ...fixture.context, spellsByKey: {} },
    ).character
    projected.spells.spellProfiles = projected.spells.spellProfiles.filter(
      (profile) => profile.type !== 'class',
    )
    const saved = characterPersistenceSchema.parse(projected)
    install(saved)
    await act(async () => {
      await useGameDataStore.setState({ gameData: { ...gameData, spells: [] } })
    })
    render(
      <TooltipProvider>
        <MemoryRouter>
          <SpellsPage />
        </MemoryRouter>
      </TooltipProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Bard/ }))
    expect(screen.getByText(/Light\|PHB — saved choice unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved choice' }))
    const cleared = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(1)
    expect(cleared.provenance.spells.light).toBeUndefined()
  })
  test('draft Cancel is byte-pure; one Finish saves both addressed choices and reopens them', async () => {
    const original = initial()
    install(original)
    const before = JSON.stringify(original)
    render(<Flow />)
    await choose(1, 'Light')
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    await choose(1, 'Light')
    await choose(2, 'Message')
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(original.id, { name: 'Latest name' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = useCharacterStore.getState().activeCharacter!
    expect(saved.name).toBe('Latest name')
    expect(
      saved.managedClassSpellChoices?.map((choice) => [choice.target.name, choice.revision]),
    ).toEqual([
      ['Light', 1],
      ['Message', 2],
    ])
    expect(characterPersistenceSchema.safeParse(saved).success).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    expect(screen.getByText('Light (PHB)')).toBeTruthy()
    expect(screen.getByText('Message (PHB)')).toBeTruthy()
    const reopened = JSON.stringify(saved)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(reopened)
  })

  test('a stale opening cannot overwrite an intervening choice or a refreshed source catalog', async () => {
    const errors = vi.spyOn(toast, 'error')
    const original = initial()
    install(original)
    render(<Flow />)
    await choose(1, 'Light')
    const result = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          1,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Message', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(original.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    })
    const newer = JSON.stringify(useCharacterStore.getState().activeCharacter)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('changed'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(newer)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen spell choices' }))
    await choose(1, 'Light')
    await act(async () => {
      await useGameDataStore.setState({ gameData: { ...gameData } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(errors).toHaveBeenLastCalledWith(expect.stringContaining('sources changed'))
    expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(newer)
  })

  test('unavailable saved choices can be cleared without sources while retaining the allocator', async () => {
    const original = initial()
    const result = setManagedClassSpellChoiceCommand(
      original,
      original.provenance,
      {
        slot: [
          ['class', 'bard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|bard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    )
    install({ ...original, ...result.characterPatch, provenance: result.provenanceUpdate })
    useGameDataStore.setState({ gameData: { ...gameData, spells: [] } })
    render(<Flow />)
    expect(await screen.findByText(/choice is saved/)).toBeTruthy()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Cantrip 1' })).getByRole('button', {
        name: 'Clear',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const cleared = useCharacterStore.getState().activeCharacter!
    expect(cleared.managedClassSpellChoices).toEqual([])
    expect(cleared.managedClassSpellRevision).toBe(1)
    expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
  })
})
