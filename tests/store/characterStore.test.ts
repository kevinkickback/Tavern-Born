import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}));

import {
  emptyProvenance,
  normalizeCharacterProvenance,
  useCharacterStore,
  validateCharacterData,
} from '@/store/characterStore';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

describe('characterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    });
  });

  test('normalizeCharacterProvenance adds empty ledger when missing', () => {
    const withoutProvenance = makeCharacterFixture();
    delete withoutProvenance.provenance;

    const normalized = normalizeCharacterProvenance(withoutProvenance);

    expect(normalized.provenance).toEqual(emptyProvenance());
  });

  test('validateCharacterData accepts full character payload', () => {
    const fixture = makeCharacterFixture();
    expect(validateCharacterData(fixture)).toBeNull();
  });

  test('validateCharacterData rejects malformed payload', () => {
    expect(validateCharacterData({ foo: 'bar' })).toContain(
      'Invalid character structure',
    );
  });

  test('validateCharacterData rejects payloads missing proficiencies.skills', () => {
    const fixture = makeCharacterFixture();
    const invalid = {
      ...fixture,
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
        savingThrows: [],
      },
    };

    expect(validateCharacterData(invalid)).toContain('proficiencies.skills');
  });

  test('createNewCharacter adds a character and returns it', () => {
    const created = useCharacterStore
      .getState()
      .createNewCharacter({ name: 'New Hero' });

    const state = useCharacterStore.getState();

    expect(created.name).toBe('New Hero');
    expect(state.characters).toHaveLength(1);
    expect(state.characters[0]?.id).toBe(created.id);
  });

  test('updateCharacter updates active character as draft and not persisted list', () => {
    const existing = makeCharacterFixture({ id: 'c1', name: 'Before' });
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    });

    useCharacterStore
      .getState()
      .updateCharacter(existing.id, { name: 'After' });

    const state = useCharacterStore.getState();
    expect(state.activeCharacter?.name).toBe('After');
    expect(state.characters[0]?.name).toBe('Before');
    expect(state.hasUnsavedChanges()).toBe(true);
  });

  test('saveActiveCharacter writes draft into persisted characters', () => {
    const existing = makeCharacterFixture({ id: 'c2', name: 'Before Save' });
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: { ...existing, name: 'After Save' },
    });

    useCharacterStore.getState().saveActiveCharacter();

    const state = useCharacterStore.getState();
    expect(state.characters[0]?.name).toBe('After Save');
    expect(state.hasUnsavedChanges()).toBe(false);
  });

  test('updateCharacter updates non-active character directly', () => {
    const a = makeCharacterFixture({ id: 'c3', name: 'A' });
    const b = makeCharacterFixture({ id: 'c4', name: 'B' });
    useCharacterStore.setState({
      characters: [a, b],
      activeCharacterId: a.id,
      activeCharacter: a,
    });

    useCharacterStore.getState().updateCharacter(b.id, { name: 'B2' });

    const state = useCharacterStore.getState();
    expect(state.characters.find((c) => c.id === 'c4')?.name).toBe('B2');
    expect(state.activeCharacter?.name).toBe('A');
  });

  test('setActiveCharacter hydrates activeCharacter from characters list', () => {
    const a = makeCharacterFixture({ id: 'c5', name: 'Pick Me' });
    useCharacterStore.setState({
      characters: [a],
      activeCharacterId: null,
      activeCharacter: null,
    });

    useCharacterStore.getState().setActiveCharacter('c5');

    expect(useCharacterStore.getState().activeCharacter?.name).toBe('Pick Me');
  });

  test('updateActiveCharacterDetails merges details object', () => {
    const existing = makeCharacterFixture({
      id: 'c6',
      details: { alignment: 'Neutral', personality: 'Calm' },
    });
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    });

    useCharacterStore
      .getState()
      .updateActiveCharacterDetails({ alignment: 'Chaotic Good' });

    expect(useCharacterStore.getState().activeCharacter?.details).toEqual({
      alignment: 'Chaotic Good',
      personality: 'Calm',
    });
  });

  test('deleteCharacter clears active selection when deleting active id', () => {
    const existing = makeCharacterFixture({ id: 'c7' });
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    });

    useCharacterStore.getState().deleteCharacter(existing.id);

    const state = useCharacterStore.getState();
    expect(state.characters).toHaveLength(0);
    expect(state.activeCharacterId).toBeNull();
    expect(state.activeCharacter).toBeNull();
  });

  test('persist rehydrate callback leaves active character unselected', () => {
    const persisted = makeCharacterFixture({ id: 'c8', name: 'Persisted' });
    delete persisted.provenance;

    const storeWithPersist = useCharacterStore as unknown as {
      persist: {
        getOptions: () => {
          onRehydrateStorage?: () =>
            | ((state?: {
                characters: (typeof persisted)[];
                activeCharacterId: string | null;
                activeCharacter: typeof persisted | null;
              }) => void)
            | undefined;
        };
      };
    };

    const onRehydrate = storeWithPersist.persist
      .getOptions()
      .onRehydrateStorage?.();

    const rehydrateState: {
      characters: ReturnType<typeof makeCharacterFixture>[];
      activeCharacterId: string | null;
      activeCharacter: ReturnType<typeof makeCharacterFixture> | null;
    } = {
      characters: [persisted],
      activeCharacterId: persisted.id,
      activeCharacter: null,
    };

    onRehydrate?.(rehydrateState);

    expect(rehydrateState.characters[0]?.provenance).toEqual(emptyProvenance());
    expect(rehydrateState.activeCharacterId).toBeNull();
    expect(rehydrateState.activeCharacter).toBeNull();
  });

  test('persist partialize stores only characters', () => {
    const fixture = makeCharacterFixture({ id: 'persist-id', name: 'Persist' });
    useCharacterStore.setState({
      characters: [fixture],
      activeCharacterId: fixture.id,
      activeCharacter: fixture,
    });

    const storeWithPersist = useCharacterStore as unknown as {
      persist: {
        getOptions: () => {
          partialize?: (state: { characters: (typeof fixture)[] }) => {
            characters: (typeof fixture)[];
          };
        };
      };
      getState: () => {
        characters: (typeof fixture)[];
      };
    };

    const partialize = storeWithPersist.persist.getOptions().partialize;
    expect(partialize).toBeTypeOf('function');

    const persisted = partialize?.(storeWithPersist.getState());
    expect(persisted).toEqual({ characters: [fixture] });
  });
});
