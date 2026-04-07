import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HomePage } from '@/pages/HomePage';
import { useCharacterStore } from '@/store/characterStore';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

interface MockCharacterCardProps {
  character: { id: string; name: string };
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
}

vi.mock('@/components/character/CharacterCard', () => ({
  CharacterCard: ({
    character,
    onLoad,
    onDelete,
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
      {selectionMode && (
        <button type="button" onClick={() => onToggleSelect?.(character.id)}>
          select-{character.id}
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/character/wizard/CharacterCreationWizard', () => ({
  CharacterCreationWizard: ({ open }: { open: boolean }) =>
    open ? <div>Character Wizard Open</div> : null,
}));

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  });
}

describe('home page integration workflows', () => {
  beforeEach(() => {
    resetCharacterStore();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('shows empty-state actions when there are no characters', async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    expect(screen.getByText('No Characters Yet')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Create First Character' }),
    );
    expect(screen.getByText('Character Wizard Open')).toBeTruthy();
  });

  test('supports multi-select deletion workflow', async () => {
    const user = userEvent.setup();
    const c1 = makeCharacterFixture({ id: 'c1', name: 'Alpha' });
    const c2 = makeCharacterFixture({ id: 'c2', name: 'Bravo' });

    useCharacterStore.setState({
      characters: [c1, c2],
      activeCharacterId: null,
      activeCharacter: null,
    });

    render(<HomePage />);

    await user.click(screen.getByTitle('Toolbar'));
    await user.click(screen.getByRole('button', { name: /multi select/i }));

    await user.click(screen.getByRole('button', { name: 'select-c1' }));
    expect(screen.getByText('1 selected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /delete \(1\)/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(useCharacterStore.getState().characters.map((c) => c.id)).toEqual([
      'c2',
    ]);
  });

  test('prompts before switching when active character has unsaved changes', async () => {
    const user = userEvent.setup();
    const c1 = makeCharacterFixture({ id: 'c1', name: 'Alpha' });
    const c2 = makeCharacterFixture({ id: 'c2', name: 'Bravo' });

    useCharacterStore.setState({
      characters: [c1, c2],
      activeCharacterId: c1.id,
      activeCharacter: { ...c1, name: 'Alpha Draft Edit' },
    });

    render(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'load-c2' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeTruthy();
    expect(useCharacterStore.getState().activeCharacterId).toBe('c1');
  });

  test('imports a valid character file', async () => {
    const user = userEvent.setup();
    useCharacterStore.setState({
      characters: [
        makeCharacterFixture({ id: 'existing-1', name: 'Existing' }),
      ],
      activeCharacterId: null,
      activeCharacter: null,
    });

    const originalCreateElement = document.createElement.bind(document);
    const fileInput = {
      type: '',
      accept: '',
      onchange: null as ((e: Event) => void | Promise<void>) | null,
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
    ) => {
      if (tagName === 'input') {
        return fileInput as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    render(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Import Character' }));
    expect(fileInput.click).toHaveBeenCalled();

    const file = new File(
      [JSON.stringify(makeCharacterFixture())],
      'hero.json',
      {
        type: 'application/json',
      },
    );

    await fileInput.onchange?.({
      target: { files: [file] },
    } as unknown as Event);

    expect(useCharacterStore.getState().characters).toHaveLength(2);
  });

  test('rejects invalid character file on import', async () => {
    const user = userEvent.setup();
    useCharacterStore.setState({
      characters: [
        makeCharacterFixture({ id: 'existing-1', name: 'Existing' }),
      ],
      activeCharacterId: null,
      activeCharacter: null,
    });

    const originalCreateElement = document.createElement.bind(document);
    const fileInput = {
      type: '',
      accept: '',
      onchange: null as ((e: Event) => void | Promise<void>) | null,
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
    ) => {
      if (tagName === 'input') {
        return fileInput as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    render(<HomePage />);

    await user.click(screen.getByRole('button', { name: 'Import Character' }));
    expect(fileInput.click).toHaveBeenCalled();

    const invalidFile = new File([JSON.stringify({ foo: 'bar' })], 'bad.json', {
      type: 'application/json',
    });

    await fileInput.onchange?.({
      target: { files: [invalidFile] },
    } as unknown as Event);

    expect(useCharacterStore.getState().characters).toHaveLength(1);
  });
});
