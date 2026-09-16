import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MAX_CHARACTER_SIZE } from '@/lib/calculations/gameRules'
import {
  CURRENT_CHARACTER_SCHEMA_VERSION,
  UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE,
} from '@/lib/schema/characterSchemaVersion'
import { HomePage } from '@/pages/HomePage'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

interface MockCharacterCardProps {
  character: { id: string; name: string }
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (character: { id: string; name: string }) => void
  selectionMode?: boolean
  onToggleSelect?: (id: string) => void
}

vi.mock('@/components/character/CharacterCard', () => ({
  CharacterCard: ({
    character,
    onLoad,
    onDelete,
    onDuplicate,
    selectionMode,
    onToggleSelect,
  }: MockCharacterCardProps) => (
    <div data-testid={`card-${character.id}`}>
      <span>{character.name}</span>
      <button type="button" onClick={() => onLoad(character.id)}>
        load-{character.id}
      </button>
      <button type="button" onClick={() => onDelete(character.id)}>
        delete-{character.id}
      </button>
      <button type="button" onClick={() => onDuplicate(character)}>
        duplicate-{character.id}
      </button>
      {selectionMode && (
        <button type="button" onClick={() => onToggleSelect?.(character.id)}>
          select-{character.id}
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/character/wizard/CharacterCreationWizard', () => ({
  CharacterCreationWizard: ({ open }: { open: boolean }) =>
    open ? <div>Character Wizard Open</div> : null,
}))

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
    isActiveCharacterDirty: false,
    unsupportedCharacterCount: 0,
  })
}

function mockDynamicFileInput() {
  const originalCreateElement = document.createElement.bind(document)
  const realInput = originalCreateElement('input') as HTMLInputElement
  realInput.click = vi.fn()

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'input') {
      return realInput
    }
    return originalCreateElement(tagName)
  }) as typeof document.createElement)

  return realInput
}

describe('home page integration workflows', () => {
  beforeEach(() => {
    resetCharacterStore()
    useAppPreferencesStore.setState({ characterViewMode: 'gallery' })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('shows empty-state actions when there are no characters', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    expect(screen.getByText('No Characters Yet')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'New Character' }))
    expect(screen.getByText('Character Wizard Open')).toBeTruthy()
  })

  test('shows the unsupported-character warning once and acknowledges it', async () => {
    useCharacterStore.setState({ unsupportedCharacterCount: 2 })

    const view = render(
      <StrictMode>
        <HomePage />
      </StrictMode>,
    )

    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1))
    expect(useCharacterStore.getState().unsupportedCharacterCount).toBe(0)

    view.unmount()
    render(<HomePage />)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  test('supports multi-select deletion workflow', async () => {
    const user = userEvent.setup()
    const c1 = makeCharacterFixture({ id: 'c1', name: 'Alpha' })
    const c2 = makeCharacterFixture({ id: 'c2', name: 'Bravo' })

    useCharacterStore.setState({
      characters: [c1, c2],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'Sort & Group' }))
    await user.click(screen.getByRole('button', { name: 'Select Multiple' }))

    await user.click(screen.getByRole('button', { name: 'select-c1' }))

    await user.click(screen.getByRole('button', { name: /^Delete$/ }))

    expect(screen.getByText('Delete selected characters?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete Selected' }))

    expect(useCharacterStore.getState().characters.map((c) => c.id)).toEqual(['c2'])
  })

  test('filters characters from the workspace toolbar', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [
        makeCharacterFixture({ id: 'c1', name: 'Alpha' }),
        makeCharacterFixture({ id: 'c2', name: 'Bravo' }),
      ],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)
    await user.type(screen.getByRole('searchbox', { name: 'Search characters' }), 'brav')

    expect(screen.queryByTestId('card-c1')).toBeNull()
    expect(screen.getByTestId('card-c2')).toBeTruthy()
  })

  test('switches to the dense list view and remembers the choice', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'c1', name: 'Alpha' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)
    await user.click(screen.getByRole('button', { name: 'List view' }))

    expect(useAppPreferencesStore.getState().characterViewMode).toBe('list')
    expect(screen.getByRole('button', { name: 'Actions for Alpha' })).toBeTruthy()
  })

  test('keeps creation commands in the collection instead of the search toolbar', () => {
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'c1', name: 'Alpha' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)
    const toolbar = document.querySelector('[data-slot="workspace-toolbar"]')

    expect(toolbar).toBeTruthy()
    expect(
      within(toolbar as HTMLElement).queryByRole('button', { name: 'New Character' }),
    ).toBeNull()
    expect(within(toolbar as HTMLElement).queryByRole('button', { name: 'Import' })).toBeNull()
    expect(screen.getByRole('button', { name: 'New Character' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy()
  })

  test('supports single-character deletion through AlertDialog', async () => {
    const user = userEvent.setup()
    const c1 = makeCharacterFixture({ id: 'c1', name: 'Alpha' })
    const c2 = makeCharacterFixture({ id: 'c2', name: 'Bravo' })

    useCharacterStore.setState({
      characters: [c1, c2],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'delete-c1' }))
    expect(screen.getByText('Delete character?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete Character' }))

    expect(useCharacterStore.getState().characters.map((c) => c.id)).toEqual(['c2'])
  })

  test('immediately creates an independent exact copy', async () => {
    const user = userEvent.setup()
    const source = makeCharacterFixture({
      id: 'source',
      name: 'Source Hero',
      hitPoints: { current: 4, temporary: 2 },
      hitPointsInitialized: true,
      conditions: ['test condition'],
    })
    useCharacterStore.setState({
      characters: [source],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)
    await user.click(screen.getByRole('button', { name: 'duplicate-source' }))

    const copy = useCharacterStore
      .getState()
      .characters.find((character) => character.id !== source.id)
    expect(screen.queryByRole('heading', { name: 'Duplicate character' })).toBeNull()
    expect(copy?.name).toBe('Source Hero (Copy)')
    expect(copy?.hitPoints).toMatchObject({ current: 4, temporary: 2 })
    expect(copy?.conditions).toEqual(source.conditions)
    expect(source.hitPoints.current).toBe(4)
  })

  test('prompts before switching when active character has unsaved changes', async () => {
    const user = userEvent.setup()
    const c1 = makeCharacterFixture({ id: 'c1', name: 'Alpha' })
    const c2 = makeCharacterFixture({ id: 'c2', name: 'Bravo' })

    useCharacterStore.setState({
      characters: [c1, c2],
      activeCharacterId: c1.id,
      activeCharacter: {
        ...c1,
        name: 'Alpha Draft Edit',
        lastModified: new Date(Date.now() + 1000).toISOString(),
      },
    })

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'load-c2' }))

    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy()
    expect(useCharacterStore.getState().activeCharacterId).toBe('c1')
  })

  test('imports a valid character file', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    const fileInput = mockDynamicFileInput()

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(fileInput.click).toHaveBeenCalled()

    const file = new File([JSON.stringify(makeCharacterFixture())], 'hero.json', {
      type: 'application/json',
    })

    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: () => [file],
    })

    await fileInput.onchange?.({ target: fileInput } as unknown as Event)

    expect(useCharacterStore.getState().characters).toHaveLength(2)
  })

  test('rejects an oversized character before reading its contents', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })
    const fileInput = mockDynamicFileInput()
    const text = vi.fn(async () => '{}')
    const oversizedFile = { size: MAX_CHARACTER_SIZE + 1, text } as unknown as File

    render(<HomePage />)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: () => [oversizedFile],
    })

    await fileInput.onchange?.({ target: fileInput } as unknown as Event)

    expect(text).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Character file exceeds the 10MB safety limit.')
  })

  test('rejects a character from an unsupported beta version', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    const fileInput = mockDynamicFileInput()

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(fileInput.click).toHaveBeenCalled()

    const oldCharacter = { ...makeCharacterFixture(), schemaVersion: undefined, version: '11.0.0' }

    const file = new File([JSON.stringify(oldCharacter)], 'old.tbc', {
      type: 'application/json',
    })

    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: () => [file],
    })

    await fileInput.onchange?.({ target: fileInput } as unknown as Event)

    expect(useCharacterStore.getState().characters).toHaveLength(1)
    expect(toast.error).toHaveBeenCalledWith(
      `Invalid character: Invalid character structure: ${UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE}`,
    )
  })

  test('rejects oversized imports before reading their contents', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })
    const fileInput = mockDynamicFileInput()
    const text = vi.fn(async () => '{}')
    const oversizedFile = { size: MAX_CHARACTER_SIZE + 1, text } as unknown as File

    render(<HomePage />)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: () => [oversizedFile],
    })

    await fileInput.onchange?.({ target: fileInput } as unknown as Event)

    expect(text).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Character file exceeds the 10MB safety limit.')
  })

  test('rejects a current-version character with corrupted nested data and reports why', async () => {
    const user = userEvent.setup()
    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    const fileInput = mockDynamicFileInput()

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(fileInput.click).toHaveBeenCalled()

    const corruptedCharacter = makeCharacterFixture({ id: 'bad', name: 'Corrupted' })
    corruptedCharacter.schemaVersion = CURRENT_CHARACTER_SCHEMA_VERSION
    corruptedCharacter.proficiencies.weapons = [
      // @ts-expect-error Deliberately invalid import payload.
      { name: 'Not a valid proficiency' },
    ]
    const invalidFile = new File([JSON.stringify(corruptedCharacter)], 'bad.json', {
      type: 'application/json',
    })

    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      get: () => [invalidFile],
    })

    await fileInput.onchange?.({ target: fileInput } as unknown as Event)

    expect(useCharacterStore.getState().characters).toHaveLength(1)
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /Invalid character: Invalid character structure: proficiencies\.weapons\.0/,
      ),
    )
  })

  test('configures file input for character import', async () => {
    const user = userEvent.setup()
    const fileInput = mockDynamicFileInput()

    useCharacterStore.setState({
      characters: [makeCharacterFixture({ id: 'existing-1', name: 'Existing' })],
      activeCharacterId: null,
      activeCharacter: null,
    })

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: 'Import' }))

    expect(fileInput.type).toBe('file')
    expect(fileInput.accept).toBe('.tbc,.json')
    expect(typeof fileInput.onchange).toBe('function')
    expect(fileInput.click).toHaveBeenCalled()
  })
})
