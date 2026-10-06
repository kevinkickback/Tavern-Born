import { create } from 'zustand'
import { type PersistStorage, persist } from 'zustand/middleware'
import { MAX_CHARACTER_SIZE, MAX_PORTRAIT_SIZE } from '@/lib/calculations/gameRules'
import {
  duplicateCharacter,
  getDuplicateCharacterName,
  getImportedCharacterName,
} from '@/lib/character/characterTransfer'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { applyAsiChoices } from '@/lib/provenance/applyAsiChoices'
import {
  CURRENT_CHARACTER_SCHEMA_VERSION,
  UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE,
} from '@/lib/schema/characterSchemaVersion'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

export { emptyProvenance } from '@/lib/character/createCharacter'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function resolveActiveCharacter(
  characters: Character[],
  activeCharacterId: string | null,
): Character | null {
  if (!activeCharacterId) return null
  const found = characters.find((character) => character.id === activeCharacterId)
  return found ?? null
}

function ensureUniqueCharacterId(character: Character, existingIds: Set<string>): Character {
  let id = character.id
  while (existingIds.has(id)) {
    id = crypto.randomUUID()
  }
  existingIds.add(id)
  return id === character.id ? character : { ...character, id }
}

function ensureUniqueCharacterIds(characters: Character[]): Character[] {
  const existingIds = new Set<string>()
  return characters.map((character) => ensureUniqueCharacterId(character, existingIds))
}

/**
 * Two-source-of-truth design (intentional):
 *
 * `characters[]`           — the library published after acknowledged storage transactions.
 * `activeCharacter`        — the in-memory draft for the currently open character.
 * `isActiveCharacterDirty` — transient edit state; it is never persisted.
 *
 * All edits go to `activeCharacter` only. `characters` stays at the last saved
 * state. User edits mark the draft dirty explicitly, so multiple updates in the
 * same millisecond cannot be mistaken for a saved character. The timestamp
 * comparison also catches imported or directly injected state.
 *
 * Any code that needs the "current truth" for the active character should read
 * `activeCharacter`, not `characters.find(...)`. The latter gives stale data
 * during an unsaved editing session.
 */
interface CharacterState {
  characters: Character[]
  activeCharacterId: string | null
  activeCharacter: Character | null
  isActiveCharacterDirty: boolean
  unsupportedCharacters: unknown[]
  finishCharacterHydration: () => void
  dismissUnsupportedCharacters: () => void
  hasUnsavedChanges: () => boolean

  setCharacters: (characters: Character[]) => Promise<void>
  addCharacter: (character: Character) => Promise<Character>
  duplicateCharacter: (id: string) => Promise<Character>
  importCharacters: (characters: readonly Character[]) => Promise<Character[]>
  updateCharacter: (id: string, updates: Partial<Character>) => void | Promise<void>
  /** Silent system correction. Clean drafts receive the patch in both snapshots;
   * dirty drafts receive it only in-memory so unrelated user edits are never persisted. */
  reconcileCharacter: (id: string, updates: Partial<Character>) => void | Promise<void>
  updateActiveCharacter: (updates: Partial<Character>) => void
  updateActiveCharacterDetails: (updates: Partial<Character['details']>) => void
  deleteCharacter: (id: string) => Promise<void>
  deleteCharacters: (ids: readonly string[]) => Promise<void>
  setActiveCharacter: (id: string | null) => void
  createNewCharacter: (initial: Partial<Character>) => Promise<Character>
  saveActiveCharacter: () => Promise<void>
}

interface CharacterLibrary {
  characters: Character[]
  unsupportedCharacters: unknown[]
}

const CHARACTER_STORAGE_NAME = 'character-storage'
const characterStorage = createIdbStorage<CharacterLibrary>()
let pendingLibraryOperation: Promise<void> | null = null
let durableLibrary: CharacterLibrary | null = null
let readLibrary: () => CharacterLibrary
let characterHydration = Promise.resolve()
let characterHydrationError: unknown = null
let finishCharacterRead: () => void = () => undefined

function enqueueLibraryOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = (pendingLibraryOperation ?? Promise.resolve()).then(async () => {
    let hydration: Promise<void>
    do {
      hydration = characterHydration
      await hydration
    } while (hydration !== characterHydration)
    if (characterHydrationError !== null)
      throw Object.assign(
        new Error('Character library could not be loaded. Reload the app and try again.'),
        { cause: characterHydrationError },
      )
    return operation()
  })
  const settled = result.then(
    () => undefined,
    () => undefined,
  )
  pendingLibraryOperation = settled
  void settled.then(() => {
    if (pendingLibraryOperation === settled) pendingLibraryOperation = null
  })
  return result
}

function isDurableLibrary(library: CharacterLibrary): boolean {
  return (
    library.characters === durableLibrary?.characters &&
    library.unsupportedCharacters === durableLibrary?.unsupportedCharacters
  )
}

async function writeLibrary(library: CharacterLibrary): Promise<void> {
  await characterStorage.setItem(CHARACTER_STORAGE_NAME, { state: library, version: 0 })
  durableLibrary = library
}

// Persist handles hydration and quarantine changes. Explicit library transactions write before
// publishing; draft-only changes and the publication of an acknowledged snapshot need no write.
const libraryStorage: PersistStorage<CharacterLibrary> = {
  getItem: (name) => characterStorage.getItem(name),
  removeItem: (name) =>
    enqueueLibraryOperation(async () => {
      await characterStorage.removeItem(name)
      durableLibrary = null
    }),
  setItem: (_name, value) => {
    if (isDurableLibrary(value.state)) return Promise.resolve()
    const result = enqueueLibraryOperation(async () => {
      const library = readLibrary()
      if (!isDurableLibrary(library)) await writeLibrary(library)
    })
    void result.catch((error) => console.error('Character library persistence failed:', error))
    return result
  },
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
  if (
    isRecord(character) &&
    typeof character.id === 'string' &&
    typeof character.name === 'string' &&
    character.schemaVersion !== CURRENT_CHARACTER_SCHEMA_VERSION
  ) {
    return { data: null, error: UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE }
  }

  const result = characterPersistenceSchema.safeParse(character)
  if (!result.success) {
    return {
      data: null,
      error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    }
  }

  const parsedCharacter = result.data as Character

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

function parseCharacterUpdate(character: Character, updates: Partial<Character>) {
  const next = { ...character, ...updates, lastModified: new Date().toISOString() }
  if (updates.asiChoices) next.provenance = applyAsiChoices(next.provenance, updates.asiChoices)
  return parseCharacterData(next)
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => {
      let pendingReconciliation: Character | null = null
      readLibrary = () => ({
        characters: get().characters,
        unsupportedCharacters: get().unsupportedCharacters,
      })

      const commitCharacters = async (
        characters: Character[],
        afterWrite?: (state: CharacterState) => Partial<CharacterState>,
      ) => {
        await writeLibrary({ characters, unsupportedCharacters: get().unsupportedCharacters })
        set((state) => ({ characters, ...afterWrite?.(state) }))
      }

      const saveDraft = (draft: Character): Promise<void> =>
        enqueueLibraryOperation(async () => {
          if (!get().characters.some((character) => character.id === draft.id))
            throw new Error('Character is no longer in the library')
          const parsed = parseCharacterData({ ...draft, lastModified: new Date().toISOString() })
          if (!parsed.data) throw new Error(parsed.error ?? 'Character could not be saved')
          const saved = parsed.data
          if (get().activeCharacterId === draft.id) set({ isActiveCharacterDirty: true })
          await commitCharacters(
            get().characters.map((character) => (character.id === draft.id ? saved : character)),
            (state) => {
              if (state.activeCharacterId !== draft.id) return {}
              return state.activeCharacter === draft
                ? { activeCharacter: saved, isActiveCharacterDirty: false }
                : { isActiveCharacterDirty: true }
            },
          )
        })

      return {
        characters: [],
        activeCharacterId: null,
        activeCharacter: null,
        isActiveCharacterDirty: false,
        unsupportedCharacters: [],

        finishCharacterHydration: () =>
          set((state) => {
            const results = state.characters.map((character) => parseCharacterData(character))
            const newlyUnsupportedCharacters = state.characters.filter(
              (_character, index) => !results[index]?.data,
            )
            return {
              characters: ensureUniqueCharacterIds(
                results.filter((result) => result.data).map((result) => result.data as Character),
              ),
              activeCharacterId: null,
              activeCharacter: null,
              isActiveCharacterDirty: false,
              unsupportedCharacters: [
                ...state.unsupportedCharacters,
                ...newlyUnsupportedCharacters,
              ],
            }
          }),

        dismissUnsupportedCharacters: () => set({ unsupportedCharacters: [] }),

        hasUnsavedChanges: () => {
          const { characters, activeCharacter, activeCharacterId, isActiveCharacterDirty } = get()
          if (!activeCharacter || !activeCharacterId) return false
          const persistedCharacter = characters.find((c) => c.id === activeCharacterId)
          if (!persistedCharacter) return false
          return (
            isActiveCharacterDirty ||
            activeCharacter.lastModified !== persistedCharacter.lastModified
          )
        },

        setCharacters: (characters) =>
          enqueueLibraryOperation(async () => {
            const validated = ensureUniqueCharacterIds(
              characters
                .map((character) => parseCharacterData(character))
                .filter((result) => result.data)
                .map((result) => result.data as Character),
            )
            await commitCharacters(validated, (state) => {
              const activeCharacter = resolveActiveCharacter(validated, state.activeCharacterId)
              if (activeCharacter && state.hasUnsavedChanges()) return {}
              return {
                activeCharacterId: activeCharacter?.id ?? null,
                activeCharacter,
                isActiveCharacterDirty: false,
              }
            })
          }),

        addCharacter: (character) =>
          enqueueLibraryOperation(async () => {
            const parsed = parseCharacterData(character)
            if (!parsed.data) {
              throw new Error(parsed.error ?? 'Character could not be added')
            }

            const existingIds = new Set(get().characters.map((existing) => existing.id))
            const uniqueCharacter = ensureUniqueCharacterId(parsed.data, existingIds)
            await commitCharacters([...get().characters, uniqueCharacter])
            return uniqueCharacter
          }),

        duplicateCharacter: (id) =>
          enqueueLibraryOperation(async () => {
            const characters = get().characters
            const source = characters.find((character) => character.id === id)
            if (!source) throw new Error('Character is no longer in the library')
            const copy = duplicateCharacter(source, {
              name: getDuplicateCharacterName(
                source.name,
                characters.map((character) => character.name),
              ),
            })
            const parsed = parseCharacterData(copy)
            if (!parsed.data) throw new Error(parsed.error ?? 'Character could not be duplicated')
            const unique = ensureUniqueCharacterId(
              parsed.data,
              new Set(characters.map((character) => character.id)),
            )
            await commitCharacters([...characters, unique])
            return unique
          }),

        importCharacters: (candidates) =>
          enqueueLibraryOperation(async () => {
            if (candidates.length === 0) return []

            const existingIds = new Set(get().characters.map((character) => character.id))
            const existingNames = get().characters.map((character) => character.name)
            const imported = candidates.map((candidate) => {
              const parsed = parseCharacterData(candidate)
              if (!parsed.data) throw new Error(parsed.error ?? 'Character could not be imported')
              const name = getImportedCharacterName(parsed.data.name, existingNames)
              existingNames.push(name)
              return ensureUniqueCharacterId(
                name === parsed.data.name ? parsed.data : { ...parsed.data, name },
                existingIds,
              )
            })
            await commitCharacters([...get().characters, ...imported])
            return imported
          }),

        updateCharacter: (id, updates) => {
          const state = get()

          // Active character updates are treated as in-memory draft changes.
          if (state.activeCharacterId === id && state.activeCharacter) {
            const parsed = parseCharacterUpdate(state.activeCharacter, updates)
            if (!parsed.data) {
              console.error('updateCharacter validation failed:', {
                id,
                error: parsed.error,
              })
              return
            }
            set({ activeCharacter: parsed.data, isActiveCharacterDirty: true })
            return
          }

          return enqueueLibraryOperation(async () => {
            const previous = get().characters.find((character) => character.id === id)
            if (!previous) throw new Error('Character is no longer in the library')
            const parsed = parseCharacterUpdate(previous, updates)
            if (!parsed.data) throw new Error(parsed.error ?? 'Character could not be updated')
            const saved = parsed.data
            await commitCharacters(
              get().characters.map((character) => (character.id === id ? saved : character)),
              (current) => {
                if (current.activeCharacterId !== id) return {}
                return current.activeCharacter === previous && !current.isActiveCharacterDirty
                  ? { activeCharacter: saved, isActiveCharacterDirty: false }
                  : { isActiveCharacterDirty: true }
              },
            )
          })
        },

        // Apply silent corrections to both snapshots only when the draft was already clean.
        // A dirty draft keeps the correction in-memory until the user's explicit Save.
        reconcileCharacter: (id, updates) => {
          const state = get()
          if (state.activeCharacterId !== id || !state.activeCharacter) return
          const now = new Date().toISOString()
          const nextActive = parseCharacterData({
            ...state.activeCharacter,
            ...updates,
            lastModified: now,
          })
          if (!nextActive.data) {
            console.error('reconcileCharacter validation failed:', { id, error: nextActive.error })
            return
          }

          const persistedCharacter = state.characters.find((character) => character.id === id)
          const hadUnsavedChanges =
            state.activeCharacter !== pendingReconciliation &&
            (state.isActiveCharacterDirty ||
              !persistedCharacter ||
              state.activeCharacter.lastModified !== persistedCharacter.lastModified)
          if (hadUnsavedChanges) {
            set({ activeCharacter: nextActive.data, isActiveCharacterDirty: true })
            return
          }
          const corrected = nextActive.data
          pendingReconciliation = corrected
          set({ activeCharacter: nextActive.data, isActiveCharacterDirty: true })
          const saved = saveDraft(corrected)
          const finish = () => {
            if (pendingReconciliation === corrected) pendingReconciliation = null
          }
          void saved.then(finish, finish)
          return saved
        },

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

            return { activeCharacter: parsed.data, isActiveCharacterDirty: true }
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

            return { activeCharacter: parsed.data, isActiveCharacterDirty: true }
          }),

        deleteCharacter: (id) => get().deleteCharacters([id]),

        deleteCharacters: (ids) =>
          enqueueLibraryOperation(async () => {
            const deletedIds = new Set(ids)
            const characters = get().characters.filter((character) => !deletedIds.has(character.id))
            if (characters.length === get().characters.length) return
            await commitCharacters(characters, (state) =>
              state.activeCharacterId && deletedIds.has(state.activeCharacterId)
                ? { activeCharacterId: null, activeCharacter: null, isActiveCharacterDirty: false }
                : {},
            )
          }),

        setActiveCharacter: (id) =>
          set((state) => {
            const found = id ? state.characters.find((c) => c.id === id) || null : null
            return {
              activeCharacterId: id,
              activeCharacter: found,
              isActiveCharacterDirty: false,
            }
          }),

        createNewCharacter: (initial) => {
          const character = createEmptyCharacter(initial)
          return get().addCharacter(character)
        },

        saveActiveCharacter: () => {
          const draft = get().activeCharacter
          return draft ? saveDraft(draft) : Promise.resolve()
        },
      }
    },
    {
      name: CHARACTER_STORAGE_NAME,
      storage: libraryStorage,
      partialize: (state) => ({
        characters: state.characters,
        unsupportedCharacters: state.unsupportedCharacters,
      }),
      onRehydrateStorage: () => {
        const finishPreviousRead = finishCharacterRead
        characterHydrationError = null
        const hydration = new Promise<void>((resolve) => {
          finishCharacterRead = resolve
        })
        characterHydration = hydration
        // Wake superseded waiters so they can recheck and wait for the newest read.
        finishPreviousRead()
        const finishHydration = finishCharacterRead
        return (state, error) => {
          if (hydration !== characterHydration) return
          characterHydrationError = error ?? null
          try {
            state?.finishCharacterHydration()
          } catch (error) {
            if (hydration === characterHydration) characterHydrationError = error
            throw error
          } finally {
            if (hydration === characterHydration) finishHydration()
          }
        }
      },
    },
  ),
)
