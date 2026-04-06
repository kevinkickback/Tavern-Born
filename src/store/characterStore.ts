import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProvenanceLedger } from '@/lib/provenance/types';
import { createIdbStorage } from '@/lib/storage/idb-storage';
import type { Character } from '@/types/character';

const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export function emptyProvenance(): ProvenanceLedger {
  const emptyMap = () =>
    ({}) as Record<string, import('@/lib/provenance/types').SourceTag[]>;
  return {
    proficiencies: {
      armor: emptyMap(),
      weapons: emptyMap(),
      tools: emptyMap(),
      languages: emptyMap(),
      skills: emptyMap(),
      savingThrows: emptyMap(),
    },
    abilityBonuses: [],
    features: emptyMap(),
    feats: emptyMap(),
    spells: emptyMap(),
    equipment: emptyMap(),
    choices: [],
  };
}

/** Ensure a persisted character has the provenance ledger, migrating gracefully. */
export function normalizeCharacterProvenance(character: Character): Character {
  if (character.provenance) return character;
  return { ...character, provenance: emptyProvenance() };
}

interface CharacterState {
  characters: Character[];
  activeCharacterId: string | null;
  activeCharacter: Character | null;
  hasUnsavedChanges: () => boolean;

  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  updateActiveCharacter: (updates: Partial<Character>) => void;
  updateActiveCharacterDetails: (
    updates: Partial<Character['details']>,
  ) => void;
  deleteCharacter: (id: string) => void;
  setActiveCharacter: (id: string | null) => void;
  createNewCharacter: (initial: Partial<Character>) => Character;
  saveActiveCharacter: () => void;
}

const createEmptyCharacter = (initial: Partial<Character> = {}): Character => {
  const now = new Date().toISOString();

  return {
    id: generateId(),
    version: '1.0.0',
    name: '',
    race: '',
    class: '',
    background: '',
    level: 1,
    experiencePoints: 0,
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      languages: [],
      savingThrows: [],
    },
    features: [],
    feats: [],
    spells: {
      cantrips: [],
      spellsKnown: [],
      spellSlots: {
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 },
      },
      preparedSpells: [],
    },
    equipment: [],
    hitPoints: {
      max: 0,
      current: 0,
      temporary: 0,
    },
    armorClass: 10,
    initiative: 0,
    speed: 30,
    savingThrows: {
      strength: { proficient: false, bonus: 0 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: false, bonus: 0 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 0 },
      charisma: { proficient: false, bonus: 0 },
    },
    skills: {},
    details: {},
    portraitTransform: {
      zoom: 100,
      panX: 0,
      panY: 0,
      rotation: 0,
    },
    createdAt: now,
    lastModified: now,
    provenance: emptyProvenance(),
    ...initial,
  };
};

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,

      hasUnsavedChanges: () => {
        const { characters, activeCharacter, activeCharacterId } = get();
        if (!activeCharacter || !activeCharacterId) {
          return false;
        }

        const persistedCharacter = characters.find(
          (character) => character.id === activeCharacterId,
        );
        if (!persistedCharacter) {
          return false;
        }

        const { lastModified: _activeLastModified, ...activeComparable } =
          activeCharacter;
        const { lastModified: _savedLastModified, ...savedComparable } =
          normalizeCharacterProvenance(persistedCharacter);

        return (
          JSON.stringify(activeComparable) !== JSON.stringify(savedComparable)
        );
      },

      setCharacters: (characters) => set({ characters }),

      addCharacter: (character) =>
        set((state) => ({
          characters: [...state.characters, character],
        })),

      updateCharacter: (id, updates) =>
        set((state) => {
          const now = new Date().toISOString();

          // Active character updates are treated as in-memory draft changes.
          if (state.activeCharacterId === id && state.activeCharacter) {
            return {
              activeCharacter: {
                ...state.activeCharacter,
                ...updates,
                lastModified: now,
              },
            };
          }

          // Fallback for non-active records: update persisted collection directly.
          const characters = state.characters.map((char) =>
            char.id === id ? { ...char, ...updates, lastModified: now } : char,
          );
          return { characters };
        }),

      updateActiveCharacter: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {};
          }

          return {
            activeCharacter: {
              ...state.activeCharacter,
              ...updates,
              lastModified: new Date().toISOString(),
            },
          };
        }),

      updateActiveCharacterDetails: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {};
          }

          return {
            activeCharacter: {
              ...state.activeCharacter,
              details: {
                ...state.activeCharacter.details,
                ...updates,
              },
              lastModified: new Date().toISOString(),
            },
          };
        }),

      deleteCharacter: (id) =>
        set((state) => ({
          characters: state.characters.filter((char) => char.id !== id),
          activeCharacterId:
            state.activeCharacterId === id ? null : state.activeCharacterId,
          activeCharacter:
            state.activeCharacterId === id ? null : state.activeCharacter,
        })),

      setActiveCharacter: (id) =>
        set((state) => {
          const found = id
            ? state.characters.find((c) => c.id === id) || null
            : null;
          const character = found ? normalizeCharacterProvenance(found) : null;
          return {
            activeCharacterId: id,
            activeCharacter: character,
          };
        }),

      createNewCharacter: (initial) => {
        const character = createEmptyCharacter(initial);
        get().addCharacter(character);
        return character;
      },

      saveActiveCharacter: () =>
        set((state) => {
          if (!state.activeCharacter) {
            return {};
          }

          const now = new Date().toISOString();
          const savedCharacter = {
            ...state.activeCharacter,
            lastModified: now,
          };

          const existingIndex = state.characters.findIndex(
            (char) => char.id === savedCharacter.id,
          );

          if (existingIndex === -1) {
            return {
              characters: [...state.characters, savedCharacter],
              activeCharacter: savedCharacter,
            };
          }

          const characters = [...state.characters];
          characters[existingIndex] = savedCharacter;

          return {
            characters,
            activeCharacter: savedCharacter,
          };
        }),
    }),
    {
      name: 'character-storage',
      storage: createIdbStorage(),
      partialize: (state) => ({
        characters: state.characters,
        activeCharacterId: state.activeCharacterId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Rehydrate activeCharacter from activeCharacterId after loading
          const activeFound = state.activeCharacterId
            ? state.characters.find((c) => c.id === state.activeCharacterId) ||
              null
            : null;
          state.activeCharacter = activeFound
            ? normalizeCharacterProvenance(activeFound)
            : null;
        }
      },
    },
  ),
);
