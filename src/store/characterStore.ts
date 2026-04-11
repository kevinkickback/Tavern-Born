import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_CHARACTER_SIZE, MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'
import { SPECIAL_SPELL_PROFILE_LABEL } from '@/lib/calculations/spellProfiles'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import {
  CURRENT_SCHEMA_VERSION,
  migrateCharacter,
  semverToMigrationVersion,
} from '@/lib/schema/migrations'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { Character } from '@/types/character'
import { characterPersistenceSchema, spellSelectionSchema } from '@/types/characterSchema'

/**
 * Validate spell data structure and return error message if invalid.
 * Returns null if valid, or error message string if invalid.
 */
export function validateCharacterSpells(character: unknown): string | null {
  if (!character || typeof character !== 'object') {
    return 'Invalid character data'
  }

  const char = character as Record<string, unknown>
  if (!char.spells) {
    return 'Character missing spells field'
  }

  // Use Zod validation
  const result = spellSelectionSchema.safeParse(char.spells)
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
    return `Invalid spell structure: ${errors}`
  }

  return null // Valid
}

function formatValidationErrors(character: unknown): string {
  const result = characterPersistenceSchema.safeParse(character)
  if (result.success) return ''
  return result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const generateId = () => crypto.randomUUID()

export function emptyProvenance(): ProvenanceLedger {
  const emptyMap = () => ({}) as Record<string, import('@/lib/provenance/types').SourceTag[]>
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
  }
}

/** Ensure a persisted character has the provenance ledger, migrating gracefully. */
export function normalizeCharacterProvenance(character: Character): Character {
  if (character.provenance) return character
  return { ...character, provenance: emptyProvenance() }
}

/**
 * Deep equality check that compares two objects structurally.
 * Handles nested objects, arrays, and primitive values.
 * More robust than JSON.stringify for property-order-insensitive comparison.
 */
function deepEquals(a: unknown, b: unknown): boolean {
  // Handle primitives and null/undefined
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEquals(item, b[index]))
  }

  // Handle objects
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a as Record<string, unknown>).sort()
  const keysB = Object.keys(b as Record<string, unknown>).sort()

  if (keysA.length !== keysB.length) return false
  if (!keysA.every((key, index) => key === keysB[index])) return false

  return keysA.every((key) =>
    deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

function isUnsavedComparedToPersisted(
  activeCharacter: Character | null,
  persistedCharacter: Character | undefined,
): boolean {
  if (!activeCharacter || !persistedCharacter) return false

  const { lastModified: _activeLastModified, ...activeComparable } = activeCharacter
  const { lastModified: _savedLastModified, ...savedComparable } = persistedCharacter

  return !deepEquals(activeComparable, savedComparable)
}

function resolveActiveCharacter(
  characters: Character[],
  activeCharacterId: string | null,
): Character | null {
  if (!activeCharacterId) return null
  const found = characters.find((character) => character.id === activeCharacterId)
  return found ? normalizeCharacterProvenance(found) : null
}

interface CharacterState {
  characters: Character[]
  activeCharacterId: string | null
  activeCharacter: Character | null
  hasUnsavedChangesFlag: boolean
  hasUnsavedChanges: () => boolean

  setCharacters: (characters: Character[]) => void
  addCharacter: (character: Character) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
  updateActiveCharacter: (updates: Partial<Character>) => void
  updateActiveCharacterDetails: (updates: Partial<Character['details']>) => void
  deleteCharacter: (id: string) => void
  setActiveCharacter: (id: string | null) => void
  createNewCharacter: (initial: Partial<Character>) => Character
  saveActiveCharacter: () => void
}

const createEmptyCharacter = (initial: Partial<Character> = {}): Character => {
  const now = new Date().toISOString()

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
  }
}

function coerceCharacterShape(character: unknown): Character | null {
  if (!isRecord(character)) return null
  const baseline = createEmptyCharacter()
  const raw = character as Partial<Character> & Record<string, unknown>

  const rawSpells: Record<string, unknown> = isRecord(raw.spells) ? raw.spells : {}
  const rawSpellSlots: Record<string, unknown> = isRecord(rawSpells.spellSlots)
    ? rawSpells.spellSlots
    : {}

  // Clamp spell slot usage to max to prevent validation failures when max decreases
  const clampedSpellSlots = Object.entries({
    ...baseline.spells.spellSlots,
    ...rawSpellSlots,
  }).reduce(
    (acc, [level, slot]) => {
      if (
        slot &&
        typeof slot === 'object' &&
        'max' in slot &&
        'used' in slot &&
        typeof slot.max === 'number' &&
        typeof slot.used === 'number'
      ) {
        acc[level as keyof typeof baseline.spells.spellSlots] = {
          max: slot.max,
          used: Math.min(slot.used, slot.max),
        } as never
      } else {
        acc[level as keyof typeof baseline.spells.spellSlots] =
          baseline.spells.spellSlots[level as keyof typeof baseline.spells.spellSlots]
      }
      return acc
    },
    {} as typeof baseline.spells.spellSlots,
  )

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
      spellSlots: clampedSpellSlots,
    },
    hitPoints: {
      ...baseline.hitPoints,
      ...(isRecord(raw.hitPoints) ? raw.hitPoints : {}),
    },
    savingThrows: {
      ...baseline.savingThrows,
      ...(isRecord(raw.savingThrows) ? raw.savingThrows : {}),
    },
    skills: isRecord(raw.skills) ? (raw.skills as Character['skills']) : baseline.skills,
    details: {
      ...baseline.details,
      ...(isRecord(raw.details) ? raw.details : {}),
    },
    portraitTransform: isRecord(raw.portraitTransform)
      ? { ...DEFAULT_PORTRAIT_TRANSFORM, ...raw.portraitTransform }
      : { ...DEFAULT_PORTRAIT_TRANSFORM },
  }
}

/**
 * Check if a character object exceeds the maximum allowed serialized size.
 * This prevents memory and storage issues from extremely large characters.
 */
function validateCharacterSize(character: Character): string | null {
  try {
    // Estimate the serialized JSON size in bytes
    const serialized = JSON.stringify(character)
    const sizeInBytes = new Blob([serialized]).size

    if (sizeInBytes > MAX_CHARACTER_SIZE) {
      const sizeMB = (sizeInBytes / (1024 * 1024)).toFixed(2)
      const maxMB = (MAX_CHARACTER_SIZE / (1024 * 1024)).toFixed(0)
      return `Character size (${sizeMB}MB) exceeds maximum allowed (${maxMB}MB). Please reduce portrait size or remove unnecessary items/spells.`
    }

    // Also check portrait size specifically if present
    if (character.portrait) {
      const portraitSize = new Blob([character.portrait]).size
      if (portraitSize > MAX_PORTRAIT_SIZE) {
        const portraitMB = (portraitSize / (1024 * 1024)).toFixed(2)
        const maxPortraitMB = (MAX_PORTRAIT_SIZE / (1024 * 1024)).toFixed(0)
        return `Portrait size (${portraitMB}MB) exceeds maximum allowed (${maxPortraitMB}MB).`
      }
    }
  } catch (err) {
    console.error('Failed to validate character size:', err)
    // Size check failure shouldn't block character loading, but log it
  }

  return null
}

function parseCharacterData(character: unknown): {
  data: Character | null
  error: string | null
} {
  // Run schema migrations before coercion so that old-format characters are
  // upgraded to the current schema version before Zod validation.
  let migrated = character
  if (isRecord(character)) {
    const storedVersion = semverToMigrationVersion((character as Record<string, unknown>).version)
    if (storedVersion < CURRENT_SCHEMA_VERSION) {
      try {
        migrated = migrateCharacter(character, storedVersion)
      } catch (err) {
        console.error('Character migration failed:', err)
        return {
          data: null,
          error: `Migration failed: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }
  }

  const coerced = coerceCharacterShape(migrated)
  if (!coerced) {
    return { data: null, error: 'Invalid character payload' }
  }

  const result = characterPersistenceSchema.safeParse(coerced)
  if (!result.success) {
    return {
      data: null,
      error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    }
  }

  const parsedCharacter = normalizeCharacterProvenance(result.data as Character)

  // Validate character size before returning
  const sizeError = validateCharacterSize(parsedCharacter)
  if (sizeError) {
    return {
      data: null,
      error: sizeError,
    }
  }

  return {
    data: parsedCharacter,
    error: null,
  }
}

export function validateCharacterData(character: unknown): string | null {
  const parsed = parseCharacterData(character)
  if (parsed.error) return `Invalid character structure: ${parsed.error}`

  return null
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      hasUnsavedChangesFlag: false,

      hasUnsavedChanges: () => {
        const { hasUnsavedChangesFlag, characters, activeCharacter, activeCharacterId } = get()
        if (hasUnsavedChangesFlag) return true
        if (!activeCharacter || !activeCharacterId) return false
        const persistedCharacter = characters.find(
          (character) => character.id === activeCharacterId,
        )
        return isUnsavedComparedToPersisted(activeCharacter, persistedCharacter)
      },

      setCharacters: (characters) =>
        set((state) => {
          const validated = characters
            .map((character) => parseCharacterData(character))
            .filter((result) => result.data)
            .map((result) => result.data as Character)
          const activeCharacter = resolveActiveCharacter(validated, state.activeCharacterId)
          const persistedCharacter = state.activeCharacterId
            ? validated.find((c) => c.id === state.activeCharacterId)
            : undefined
          return {
            characters: validated,
            activeCharacter,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(
              activeCharacter,
              persistedCharacter,
            ),
          }
        }),

      addCharacter: (character) =>
        set((state) => {
          const parsed = parseCharacterData(character)
          if (!parsed.data) {
            throw new Error(parsed.error ?? formatValidationErrors(character))
          }
          return {
            characters: [...state.characters, parsed.data],
          }
        }),

      updateCharacter: (id, updates) =>
        set((state) => {
          const now = new Date().toISOString()

          // Active character updates are treated as in-memory draft changes.
          if (state.activeCharacterId === id && state.activeCharacter) {
            const next = {
              ...state.activeCharacter,
              ...updates,
              lastModified: now,
            }
            const parsed = parseCharacterData(next)
            if (!parsed.data) {
              console.error('updateCharacter validation failed:', {
                id,
                error: parsed.error,
              })
              return {}
            }
            const persistedCharacter = state.characters.find((character) => character.id === id)
            return {
              activeCharacter: parsed.data,
              hasUnsavedChangesFlag: isUnsavedComparedToPersisted(parsed.data, persistedCharacter),
            }
          }

          // Fallback for non-active records: update persisted collection directly.
          const characters = state.characters.map((char) => {
            if (char.id !== id) return char
            const parsed = parseCharacterData({
              ...char,
              ...updates,
              lastModified: now,
            })
            return parsed.data ?? char
          })
          return {
            characters,
            hasUnsavedChangesFlag: state.hasUnsavedChangesFlag,
          }
        }),

      updateActiveCharacter: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {}
          }

          const parsed = parseCharacterData({
            ...state.activeCharacter,
            ...updates,
            lastModified: new Date().toISOString(),
          })
          if (!parsed.data) return {}

          const persistedCharacter = state.activeCharacterId
            ? state.characters.find((c) => c.id === state.activeCharacterId)
            : undefined

          return {
            activeCharacter: parsed.data,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(parsed.data, persistedCharacter),
          }
        }),

      updateActiveCharacterDetails: (updates) =>
        set((state) => {
          if (!state.activeCharacter) {
            return {}
          }

          const parsed = parseCharacterData({
            ...state.activeCharacter,
            details: {
              ...state.activeCharacter.details,
              ...updates,
            },
            lastModified: new Date().toISOString(),
          })
          if (!parsed.data) return {}

          const persistedCharacter = state.activeCharacterId
            ? state.characters.find((c) => c.id === state.activeCharacterId)
            : undefined

          return {
            activeCharacter: parsed.data,
            hasUnsavedChangesFlag: isUnsavedComparedToPersisted(parsed.data, persistedCharacter),
          }
        }),

      deleteCharacter: (id) =>
        set((state) => {
          const deletingActive = state.activeCharacterId === id
          return {
            characters: state.characters.filter((char) => char.id !== id),
            activeCharacterId: deletingActive ? null : state.activeCharacterId,
            activeCharacter: deletingActive ? null : state.activeCharacter,
            hasUnsavedChangesFlag: deletingActive ? false : state.hasUnsavedChangesFlag,
          }
        }),

      setActiveCharacter: (id) =>
        set((state) => {
          const found = id ? state.characters.find((c) => c.id === id) || null : null
          const character = found ? normalizeCharacterProvenance(found) : null
          return {
            activeCharacterId: id,
            activeCharacter: character,
            hasUnsavedChangesFlag: false,
          }
        }),

      createNewCharacter: (initial) => {
        const character = createEmptyCharacter(initial)
        get().addCharacter(character)
        return character
      },

      saveActiveCharacter: () =>
        set((state) => {
          if (!state.activeCharacter) {
            return {}
          }

          const now = new Date().toISOString()
          const savedCharacter = {
            ...state.activeCharacter,
            lastModified: now,
          }
          const parsed = parseCharacterData(savedCharacter)
          if (!parsed.data) {
            console.error('saveActiveCharacter validation failed:', {
              id: state.activeCharacter.id,
              error: parsed.error,
            })
            return {}
          }
          const validatedCharacter = parsed.data

          const existingIndex = state.characters.findIndex(
            (char) => char.id === validatedCharacter.id,
          )

          if (existingIndex === -1) {
            return {
              characters: [...state.characters, validatedCharacter],
              activeCharacter: validatedCharacter,
              hasUnsavedChangesFlag: false,
            }
          }

          const characters = [...state.characters]
          characters[existingIndex] = validatedCharacter

          return {
            characters,
            activeCharacter: validatedCharacter,
            hasUnsavedChangesFlag: false,
          }
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
          const validatedCharacters = state.characters
            .map((character) => parseCharacterData(character))
            .filter((result) => result.data)
            .map((result) => result.data as Character)

          // Persist passes a mutable state snapshot into this callback.
          // Direct assignment here is intentional and scoped to hydration only.
          state.characters = validatedCharacters

          state.activeCharacter = resolveActiveCharacter(
            validatedCharacters,
            state.activeCharacterId,
          )
          state.hasUnsavedChangesFlag = false
        }
      },
    },
  ),
)
