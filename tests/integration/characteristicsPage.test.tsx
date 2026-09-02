import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CUSTOM_ORGANIZATION_KEY } from '@/lib/character/organizationConstants'
import { CharacteristicsPage } from '@/pages/details/CharacteristicsPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/components/ui/select', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const SelectContext = React.createContext<(value: string) => void>(() => undefined)

  return {
    Select: ({
      onValueChange,
      children,
    }: {
      onValueChange: (value: string) => void
      children: React.ReactNode
    }) => (
      <SelectContext.Provider value={onValueChange}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
      <button id={id} type="button">
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const onValueChange = React.useContext(SelectContext)
      return (
        <button type="button" role="option" onClick={() => onValueChange(value)}>
          {children}
        </button>
      )
    },
  }
})

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    deities: [],
    organizations: [
      {
        name: 'Harpers',
        source: 'SCAG',
        description: 'A covert network that opposes tyranny.',
      },
    ],
  }),
}))

function setActiveCharacter(character = makeCharacterFixture()) {
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

function inputValue(placeholder: string): string {
  return (screen.getByPlaceholderText(placeholder) as HTMLInputElement | HTMLTextAreaElement).value
}

describe('CharacteristicsPage', () => {
  beforeEach(() => {
    setActiveCharacter(
      makeCharacterFixture({
        id: 'character-one',
        name: 'First Character',
        details: { playerName: 'First Player', age: 32 },
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('populates fields and refreshes them when the active character changes', async () => {
    render(<CharacteristicsPage />)

    expect(inputValue('Character name')).toBe('First Character')
    expect(inputValue('Player name')).toBe('First Player')
    expect(inputValue('25')).toBe('32')

    const secondCharacter = makeCharacterFixture({
      id: 'character-two',
      name: 'Second Character',
      details: { playerName: 'Second Player', age: 44 },
    })
    act(() => {
      useCharacterStore.setState({
        characters: [secondCharacter],
        activeCharacterId: secondCharacter.id,
        activeCharacter: secondCharacter,
      })
    })

    await waitFor(() => {
      expect(inputValue('Character name')).toBe('Second Character')
      expect(inputValue('Player name')).toBe('Second Player')
      expect(inputValue('25')).toBe('44')
    })
  })

  test('persists detail edits immediately through the character store', async () => {
    const user = userEvent.setup()
    render(<CharacteristicsPage />)

    const playerName = screen.getByPlaceholderText('Player name')
    await user.clear(playerName)
    await user.type(playerName, 'Updated Player')

    expect(useCharacterStore.getState().activeCharacter?.details.playerName).toBe('Updated Player')
  })

  test('maps legacy organization text to the custom organization draft', async () => {
    const legacyCharacter = makeCharacterFixture({
      details: { alliesAndOrganizations: 'Legacy alliance details' },
    })
    setActiveCharacter(legacyCharacter)
    const user = userEvent.setup()
    render(<CharacteristicsPage />)

    await user.click(screen.getByRole('tab', { name: 'Connections' }))

    await waitFor(() => {
      expect(inputValue('Organization name')).toBe('')
      expect(inputValue('Describe the custom ally or organization.')).toBe(
        'Legacy alliance details',
      )
    })
    expect(useCharacterStore.getState().activeCharacter?.details.organizationSelectionKey).toBe(
      undefined,
    )
  })

  test('selecting a preset organization clears custom fields and persists its description', async () => {
    const customCharacter = makeCharacterFixture({
      details: {
        organizationSelectionKey: CUSTOM_ORGANIZATION_KEY,
        organizationCustomName: 'Custom Group',
        organizationCustomDescription: 'Custom description',
        organizationCustomImage: 'data:image/png;base64,image',
        organizationCustomGradient: 'rose',
      },
    })
    setActiveCharacter(customCharacter)
    const user = userEvent.setup()
    render(<CharacteristicsPage />)

    await user.click(screen.getByRole('tab', { name: 'Connections' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Harpers' }))

    await waitFor(() => {
      expect(useCharacterStore.getState().activeCharacter?.details).toMatchObject({
        organizationSelectionKey: 'Harpers|SCAG',
        organizationCustomName: '',
        organizationCustomDescription: '',
        organizationCustomImage: '',
        organizationCustomGradient: 'indigo',
        alliesAndOrganizations: 'A covert network that opposes tyranny.',
      })
    })
  })
})
