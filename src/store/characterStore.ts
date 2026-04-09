import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SPECIAL_SPELL_PROFILE_LABEL } from '@/lib/calculations/spellProfiles';
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants';
import type { ProvenanceLedger } from '@/lib/provenance/types';
import {
  CURRENT_SCHEMA_VERSION,
  migrateCharacter,
  semverToMigrationVersion,
} from '@/lib/schema/migrations';
import { createIdbStorage } from '@/lib/storage/idb-storage';
import type { Character } from '@/types/character';
import {
  characterPersistenceSchema,
  spellSelectionSchema,
} from '@/types/characterSchema';

/**
 * Validate spell data structure and return error message if invalid.
 * Returns null if valid, or error message string if invalid.
 */
export function validateCharacterSpells(character: unknown): string | null {
  if (!character || typeof character !== 'object') {
    return 'Invalid character data';
  }

  const char = character as Record<string, unknown>;
  if (!char.spells) {
    return 'Character missing spells field';
  }

  // Use Zod validation
  const result = spellSelectionSchema.safeParse(char.spells);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    return `Invalid spell structure: ${errors}`;
  }

  return null; // Valid
}

function formatValidationErrors(character: unknown): string {
  const result = characterPersistenceSchema.safeParse(character);
  if (result.success) return '';
  return result.error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join('; ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const generateId = () => crypto.randomUUID();

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

function isUnsavedComparedToPersisted(
  activeCharacter: Character | null,
  persistedCharacter: Character | undefined,
): boolean {
  if (!activeCharacter || !persistedCharacter) return false;

  const { lastModified: _activeLastModified, ...activeComparable } =
    activeCharacter;
  const { lastModified: _savedLastModified, ...savedComparable } =
    persistedCharacter;

  return JSON.stringify(activeComparable) !== JSON.stringify(savedComparable);
}

interface CharacterState {
  characters: Character[];
  activeCharacterId: string | null;
  activeCharacter: Character | null;
  hasUnsavedChangesFlag: boolean;
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
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
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
      skills: [],
      languages: [],
      savingThrows: [],
    },
    features: [],
    feats: [],
    spells: {
      spellProfiles: [
        {
          id: 'special:unrestricted',
          type: 'special',
          label: SPECIAL_SPELL_PROFILE_LABEL,
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ],
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
    portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM },
    createdAt: now,
    lastModified: now,
    provenance: emptyProvenance(),
    ...initial,
  };
};

function coerceCharacterShape(character: unknown): Character | null {
  if (!isRecord(character)) return null;
  const baseline = createEmptyCharacter();
  const raw = character as Partial<Character> & Record<string, unknown>;

  const rawSpells: Record<string, unknown> = isRecord(raw.spells)
    ? raw.spells
    : {};
  const rawSpellSlots: Record<string, unknown> = isRecord(rawSpells.spellSlots)
    ? rawSpells.spellSlots
    : {};

  return {
    ...baseline,
    ...raw,
    abilityScores: {
      ...baseline.abilityScores,
      ...(isRecord(raw.abilityScores) ? raw.abilityScores : {}),
    },
    proficiencies: isRecord(raw.proficiencies)
      ? (raw.proficiencies as Character['proficiencies'])
      : baseline.proficiencies,
    spells: {
      spellProfiles: Array.isArray(rawSpells.spellProfiles)
        ? rawSpells.spellProfiles
        : baseline.spells.spellProfiles,
      spellSlots: {
        ...baseline.spells.spellSlots,
        ...rawSpellSlots,
      },
    },
    hitPoints: {
      ...baseline.hitPoints,
      ...(isRecord(raw.hitPoints) ? raw.hitPoints : {}),
    },
    savingThrows: {
      ...baseline.savingThrows,
      ...(isRecord(raw.savingThrows) ? raw.savingThrows : {}),
    },
    skills: isRecord(raw.skills)
      ? (raw.skills as Character['skills'])
      : baseline.skills,
    details: {
      ...baseline.details,
      ...(isRecord(raw.details) ? raw.details : {}),
    },
    portraitTransform: isRecord(raw.portraitTransform)
      ? { ...DEFAULT_PORTRAIT_TRANSFORM, ...raw.portraitTransform }
      : { ...DEFAULT_PORTRAIT_TRANSFORM },
  };
}

function parseCharacterData(character: unknown): {
  data: Character | null;
  error: string | null;
} {
  // Run schema migrations before coercion so that old-format characters are
  // upgraded to the current schema version before Zod validation.
  let migrated = character;
  if (isRecord(character)) {
    const storedVersion = semverToMigrationVersion(
      (character as Record<string, unknown>).version,
    );
    if (storedVersion < CURRENT_SCHEMA_VERSION) {
      try {
        migrated = migrateCharacter(character, storedVersion);
      } catch (err) {
        console.error('Character migration failed:', err);
        return {
          data: null,
          error: `Migration failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  const coerced = coerceCharacterShape(migrated);
  if (!coerced) {
    return { data: null, error: 'Invalid character payload' };
  }

  const result = characterPersistenceSchema.safeParse(coerced);
  if (!result.success) {
    return {
      data: null,
      error: result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; '),
    };
  }

  return {
    data: normalizeCharacterProvenance(result.data as Character),
    error: null,
  };
}

export function validateCharacterData(character: unknown): string | null {
  const parsed = parseCharacterData(character);
  if (parsed.error) return `Invalid character structure: ${parsed.error}`;

  const spellError = validateCharacterSpells(parsed.data);
  if (spellError) return spellError;

  return null;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      hasUnsavedChangesFlag: false,

      hasUnsavedChanges: () => {
        const {
          hasUnsavedChangesFlag,
          characters,
          activeCharacter,
          activeCharacterId,
        } = get();
        if (hasUnsavedChangesFlag) return true;
        if (!activeCharacter || !activeCharacterId) return false;
        const persistedCharacter = characters.find(
          (character) => character.id === activeCharacterId,
        );
        return isUnsavedComparedToPersisted(
          activeCharacter,
          persistedCharacter,
        );
      },

      setCharacters: (characters) =>
        set((state) => {
          const validated = characters
            .map((character) => parseCharacterData(character))
            .filter((result) => result.data)
            .map((result) => result.data as Character);
          const persistedCharacter = state.activeCharacterId
            ? validated.find((c) => c.id === state.activeCharacterId)
            : undefined;
          return {
            characters: validated,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(
              state.activeCharacter,
              persistedCharacter,
            ),
          };
        }),

      addCharacter: (character) =>
        set((state) => {
          const parsed = parseCharacterData(character);
          if (!parsed.data) {
            throw new Error(parsed.error ?? formatValidationErrors(character));
          }
          return {
            characters: [...state.characters, parsed.data],
          };
        }),

      updateCharacter: (id, updates) =>
        set((state) => {
          const now = new Date().toISOString();

          // Active character updates are treated as in-memory draft changes.
          if (state.activeCharacterId === id && state.activeCharacter) {
            const next = {
              ...state.activeCharacter,
              ...updates,
              lastModified: now,
            };
            const parsed = parseCharacterData(next);
            if (!parsed.data) {
              console.error('updateCharacter validation failed:', {
                id,
                error: parsed.error,
              });
              return {};
            }
            const persistedCharacter = state.characters.find(
              (character) => character.id === id,
            );
            return {
              activeCharacter: parsed.data,
              hasUnsavedChangesFlag: isUnsavedComparedToPersisted(
                parsed.data,
                persistedCharacter,
              ),
            };
          }

          // Fallback for non-active records: update persisted collection directly.
          const characters = state.characters.map((char) => {
            if (char.id !== id) return char;
            const parsed = parseCharacterData({
              ...char,
              ...updates,
              lastModified: now,
            });
            return parsed.data ?? char;
          });
          return {
            characters,
            hasUnsavedChangesFlag: state.hasUnsavedChangesFlag,
          };
        }),

      updateActiveCharacter: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {};
          }

          const parsed = parseCharacterData({
            ...state.activeCharacter,
            ...updates,
            lastModified: new Date().toISOString(),
          });
          if (!parsed.data) return {};

          const persistedCharacter = state.activeCharacterId
            ? state.characters.find((c) => c.id === state.activeCharacterId)
            : undefined;

          return {
            activeCharacter: parsed.data,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(
              parsed.data,
              persistedCharacter,
            ),
          };
        }),

      updateActiveCharacterDetails: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {};
          }

          const parsed = parseCharacterData({
            ...state.activeCharacter,
            details: {
              ...state.activeCharacter.details,
              ...updates,
            },
            lastModified: new Date().toISOString(),
          });
          if (!parsed.data) return {};

          const persistedCharacter = state.activeCharacterId
            ? state.characters.find((c) => c.id === state.activeCharacterId)
            : undefined;

          return {
            activeCharacter: parsed.data,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(
              parsed.data,
              persistedCharacter,
            ),
          };
        }),

      deleteCharacter: (id) =>
        set((state) => {
          const deletingActive = state.activeCharacterId === id;
          return {
            characters: state.characters.filter((char) => char.id !== id),
            activeCharacterId: deletingActive ? null : state.activeCharacterId,
            activeCharacter: deletingActive ? null : state.activeCharacter,
            hasUnsavedChangesFlag: deletingActive
              ? false
              : state.hasUnsavedChangesFlag,
          };
        }),

      setActiveCharacter: (id) =>
        set((state) => {
          const found = id
            ? state.characters.find((c) => c.id === id) || null
            : null;
          const character = found ? normalizeCharacterProvenance(found) : null;
          return {
            activeCharacterId: id,
            activeCharacter: character,
            hasUnsavedChangesFlag: false,
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
          const parsed = parseCharacterData(savedCharacter);
          if (!parsed.data) {
            console.error('saveActiveCharacter validation failed:', {
              id: state.activeCharacter.id,
              error: parsed.error,
            });
            return {};
          }
          const validatedCharacter = parsed.data;

          const existingIndex = state.characters.findIndex(
            (char) => char.id === validatedCharacter.id,
          );

          if (existingIndex === -1) {
            return {
              characters: [...state.characters, validatedCharacter],
              activeCharacter: validatedCharacter,
              hasUnsavedChangesFlag: false,
            };
          }

          const characters = [...state.characters];
          characters[existingIndex] = validatedCharacter;

          return {
            characters,
            activeCharacter: validatedCharacter,
            hasUnsavedChangesFlag: false,
          };
        }),
    }),
    {
      name: 'character-storage',
      storage: createIdbStorage(),
      partialize: (state) => ({
        characters: state.characters,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const validatedCharacters = state.characters
            .map((character) => parseCharacterData(character))
            .filter((result) => result.data)
            .map((result) => result.data as Character);

          // Persist passes a mutable state snapshot into this callback.
          // Direct assignment here is intentional and scoped to hydration only.
          state.characters = validatedCharacters;

          // Always start without an active selection. Users explicitly pick
          // the character they want to work on from Home.
          state.activeCharacterId = null;
          state.activeCharacter = null;
          state.hasUnsavedChangesFlag = false;
        }
      },
    },
  ),
);
