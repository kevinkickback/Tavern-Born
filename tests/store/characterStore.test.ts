import { beforeEach, describe, expect, test, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  removeItem: vi.fn(async () => undefined),
}))

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => storageMocks,
}))

import {
  CURRENT_CHARACTER_SCHEMA_VERSION,
  UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE,
} from '@/lib/schema/characterSchemaVersion'
import { useCharacterStore, validateCharacterData } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characterStore', () => {
  beforeEach(() => {
    storageMocks.getItem.mockReset().mockResolvedValue(null)
    storageMocks.setItem.mockReset().mockResolvedValue(undefined)
    storageMocks.removeItem.mockReset().mockResolvedValue(undefined)
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      isActiveCharacterDirty: false,
      unsupportedCharacters: [],
    })
  })

  test('validateCharacterData accepts full character payload', () => {
    const fixture = makeCharacterFixture()
    expect(validateCharacterData(fixture)).toBeNull()
  })

  test('validateCharacterData rejects malformed payload', () => {
    expect(validateCharacterData({ foo: 'bar' })).toContain('Invalid character structure')
  })

  test.each([0, 1, 3, '2', 'invalid'])('rejects unsupported schema version %s', (schemaVersion) => {
    expect(validateCharacterData({ ...makeCharacterFixture(), schemaVersion })).toContain(
      UNSUPPORTED_CHARACTER_SCHEMA_VERSION_MESSAGE,
    )
  })

  test('uses the exact current character schema version', () => {
    expect(makeCharacterFixture().schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
  })

  test('rejects removed top-level class and level mirrors', () => {
    expect(
      validateCharacterData({
        ...makeCharacterFixture(),
        class: 'Fighter',
        classSource: 'PHB',
        level: 1,
      }),
    ).toContain('Unrecognized key')
  })

  test.each([
    { raceSource: undefined },
    { backgroundSource: undefined },
    { subrace: 'High Elf', subraceSource: undefined },
    {
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
        },
      ],
    },
  ])('rejects named origin selections without exact sources: %o', (updates) => {
    expect(validateCharacterData({ ...makeCharacterFixture(), ...updates })).toContain(
      'is required when',
    )
  })

  test('validateCharacterData rejects payloads missing proficiencies.skills', () => {
    const fixture = makeCharacterFixture()
    const invalid = {
      ...fixture,
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
        savingThrows: [],
      },
    }

    expect(validateCharacterData(invalid)).toContain('proficiencies.skills')
  })

  test('createNewCharacter adds a character and returns it', () => {
    const created = useCharacterStore.getState().createNewCharacter({ name: 'New Hero' })

    const state = useCharacterStore.getState()

    expect(created.name).toBe('New Hero')
    expect(created.originSystem).toBe('2014')
    expect(state.characters).toHaveLength(1)
    expect(state.characters[0]?.id).toBe(created.id)
  })

  test('addCharacter assigns a fresh ID when an imported ID already exists', () => {
    const existing = makeCharacterFixture({ id: 'duplicate-id', name: 'Original' })
    const imported = makeCharacterFixture({ id: 'duplicate-id', name: 'Imported Copy' })
    useCharacterStore.setState({ characters: [existing] })

    const added = useCharacterStore.getState().addCharacter(imported)
    const state = useCharacterStore.getState()

    expect(added.id).not.toBe(existing.id)
    expect(state.characters).toHaveLength(2)
    expect(new Set(state.characters.map((character) => character.id)).size).toBe(2)
    expect(state.characters[1]).toEqual(added)
  })

  test('setCharacters repairs duplicate IDs from persisted data', () => {
    const first = makeCharacterFixture({ id: 'duplicate-id', name: 'First' })
    const second = makeCharacterFixture({ id: 'duplicate-id', name: 'Second' })

    useCharacterStore.getState().setCharacters([first, second])

    const characters = useCharacterStore.getState().characters
    expect(characters[0]?.id).toBe('duplicate-id')
    expect(characters[1]?.id).not.toBe('duplicate-id')
    expect(new Set(characters.map((character) => character.id)).size).toBe(2)
  })

  test('updateCharacter updates active character as draft and not persisted list', () => {
    const existing = makeCharacterFixture({ id: 'c1', name: 'Before' })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    })

    useCharacterStore.getState().updateCharacter(existing.id, { name: 'After' })

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.name).toBe('After')
    expect(state.characters[0]?.name).toBe('Before')
    expect(state.hasUnsavedChanges()).toBe(true)
  })

  test('reconcileCharacter keeps a clean system correction synchronized and clean', () => {
    const existing = makeCharacterFixture({ id: 'clean-reconciliation' })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
      isActiveCharacterDirty: false,
    })

    useCharacterStore.getState().reconcileCharacter(existing.id, {
      movement: { ...existing.movement, speeds: { walk: 35 } },
    })

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.movement.speeds.walk).toBe(35)
    expect(state.characters[0]?.movement.speeds.walk).toBe(35)
    expect(state.hasUnsavedChanges()).toBe(false)
  })

  test('reconcileCharacter never persists a system correction over an existing dirty draft', () => {
    const existing = makeCharacterFixture({
      id: 'dirty-reconciliation',
      name: 'Persisted Name',
    })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
      isActiveCharacterDirty: false,
    })
    useCharacterStore.getState().updateCharacter(existing.id, { name: 'Unsaved Name' })

    useCharacterStore.getState().reconcileCharacter(existing.id, {
      movement: { ...existing.movement, speeds: { walk: 35 } },
    })

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.name).toBe('Unsaved Name')
    expect(state.activeCharacter?.movement.speeds.walk).toBe(35)
    expect(state.characters[0]?.name).toBe('Persisted Name')
    expect(state.characters[0]?.movement.speeds.walk).toBe(30)
    expect(state.hasUnsavedChanges()).toBe(true)
  })

  test('saveActiveCharacter writes draft into persisted characters', async () => {
    const existing = makeCharacterFixture({ id: 'c2', name: 'Before Save' })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: { ...existing, name: 'After Save' },
    })

    await useCharacterStore.getState().saveActiveCharacter()

    const state = useCharacterStore.getState()
    expect(state.characters[0]?.name).toBe('After Save')
    expect(state.hasUnsavedChanges()).toBe(false)
  })

  test('keeps an edit dirty when save and update occur in the same millisecond', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const existing = makeCharacterFixture({
      id: 'same-millisecond',
      name: 'Before Save',
      lastModified: new Date().toISOString(),
    })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
      isActiveCharacterDirty: false,
    })

    await useCharacterStore.getState().saveActiveCharacter()
    useCharacterStore.getState().updateCharacter(existing.id, { name: 'After Save' })

    expect(useCharacterStore.getState().activeCharacter?.lastModified).toBe(
      useCharacterStore.getState().characters[0]?.lastModified,
    )
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
    vi.useRealTimers()
  })

  test('detects an edit made in the same millisecond as a save', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'))
    const existing = makeCharacterFixture({ id: 'same-millisecond', name: 'Before' })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
      isActiveCharacterDirty: false,
    })

    await useCharacterStore.getState().saveActiveCharacter()
    useCharacterStore.getState().updateCharacter(existing.id, { name: 'After' })

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.lastModified).toBe(state.characters[0]?.lastModified)
    expect(state.hasUnsavedChanges()).toBe(true)
    vi.useRealTimers()
  })

  test('keeps the draft dirty until the durable save finishes', async () => {
    const existing = makeCharacterFixture({ id: 'pending-save', name: 'Before' })
    const draft = { ...existing, name: 'After' }
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: draft,
      isActiveCharacterDirty: true,
    })
    let finishWrite: (() => void) | undefined
    storageMocks.setItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )

    const save = useCharacterStore.getState().saveActiveCharacter()
    await Promise.resolve()

    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
    finishWrite?.()
    await save
    expect(useCharacterStore.getState().characters[0]?.name).toBe('After')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })

  test('preserves the saved snapshot and dirty draft when durable persistence fails', async () => {
    const existing = makeCharacterFixture({ id: 'failed-save', name: 'Before' })
    const draft = { ...existing, name: 'After' }
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: draft,
      isActiveCharacterDirty: true,
    })
    storageMocks.setItem.mockRejectedValueOnce(
      new DOMException('Storage full', 'QuotaExceededError'),
    )

    await expect(useCharacterStore.getState().saveActiveCharacter()).rejects.toMatchObject({
      name: 'QuotaExceededError',
    })

    const state = useCharacterStore.getState()
    expect(state.characters[0]?.name).toBe('Before')
    expect(state.activeCharacter?.name).toBe('After')
    expect(state.hasUnsavedChanges()).toBe(true)

    await useCharacterStore.getState().saveActiveCharacter()
    expect(useCharacterStore.getState().characters[0]?.name).toBe('After')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })

  test('does not clear an edit made while a save is pending', async () => {
    const existing = makeCharacterFixture({ id: 'edit-during-save', name: 'Before' })
    const draft = { ...existing, name: 'Saving' }
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: draft,
      isActiveCharacterDirty: true,
    })
    let finishWrite: (() => void) | undefined
    storageMocks.setItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )

    const save = useCharacterStore.getState().saveActiveCharacter()
    await Promise.resolve()
    useCharacterStore.getState().updateCharacter(existing.id, { name: 'Edited Again' })
    finishWrite?.()
    await save

    const state = useCharacterStore.getState()
    expect(state.characters[0]?.name).toBe('Saving')
    expect(state.activeCharacter?.name).toBe('Edited Again')
    expect(state.hasUnsavedChanges()).toBe(true)
  })

  test('updateCharacter updates non-active character directly', () => {
    const a = makeCharacterFixture({ id: 'c3', name: 'A' })
    const b = makeCharacterFixture({ id: 'c4', name: 'B' })
    useCharacterStore.setState({
      characters: [a, b],
      activeCharacterId: a.id,
      activeCharacter: a,
    })

    useCharacterStore.getState().updateCharacter(b.id, { name: 'B2' })

    const state = useCharacterStore.getState()
    expect(state.characters.find((c) => c.id === 'c4')?.name).toBe('B2')
    expect(state.activeCharacter?.name).toBe('A')
  })

  test('setActiveCharacter hydrates activeCharacter from characters list', () => {
    const a = makeCharacterFixture({ id: 'c5', name: 'Pick Me' })
    useCharacterStore.setState({
      characters: [a],
      activeCharacterId: null,
      activeCharacter: null,
    })

    useCharacterStore.getState().setActiveCharacter('c5')

    expect(useCharacterStore.getState().activeCharacter?.name).toBe('Pick Me')
  })

  test('updateActiveCharacterDetails merges details object', () => {
    const existing = makeCharacterFixture({
      id: 'c6',
      details: { alignment: 'Neutral', personality: 'Calm' },
    })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    })

    useCharacterStore.getState().updateActiveCharacterDetails({ alignment: 'Chaotic Good' })

    expect(useCharacterStore.getState().activeCharacter?.details).toEqual({
      alignment: 'Chaotic Good',
      personality: 'Calm',
    })
  })

  test('deleteCharacter clears active selection when deleting active id', () => {
    const existing = makeCharacterFixture({ id: 'c7' })
    useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    })

    useCharacterStore.getState().deleteCharacter(existing.id)

    const state = useCharacterStore.getState()
    expect(state.characters).toHaveLength(0)
    expect(state.activeCharacterId).toBeNull()
    expect(state.activeCharacter).toBeNull()
  })

  test('persist rehydrate durably quarantines unsupported characters until acknowledgment', async () => {
    const persisted = {
      ...makeCharacterFixture({ id: 'c8', name: 'Persisted' }),
      schemaVersion: 0,
    }

    const storeWithPersist = useCharacterStore as unknown as {
      persist: {
        getOptions: () => {
          onRehydrateStorage?: () => (state?: ReturnType<typeof useCharacterStore.getState>) => void
        }
      }
    }

    useCharacterStore.setState({
      characters: [persisted as ReturnType<typeof makeCharacterFixture>],
      activeCharacterId: persisted.id,
      activeCharacter: persisted as ReturnType<typeof makeCharacterFixture>,
    })
    storageMocks.setItem.mockClear()
    const subscriber = vi.fn()
    const unsubscribe = useCharacterStore.subscribe(subscriber)
    const onRehydrate = storeWithPersist.persist.getOptions().onRehydrateStorage?.()
    onRehydrate?.(useCharacterStore.getState())

    const state = useCharacterStore.getState()
    expect(state.characters).toEqual([])
    expect(state.activeCharacterId).toBeNull()
    expect(state.activeCharacter).toBeNull()
    expect(state.unsupportedCharacters).toEqual([persisted])
    onRehydrate?.(useCharacterStore.getState())
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual([persisted])
    expect(subscriber).toHaveBeenCalled()
    await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalled())
    expect(storageMocks.setItem).toHaveBeenLastCalledWith(
      'character-storage',
      expect.objectContaining({
        state: { characters: [], unsupportedCharacters: [persisted] },
      }),
    )
    storageMocks.setItem.mockClear()
    state.dismissUnsupportedCharacters()
    expect(useCharacterStore.getState().unsupportedCharacters).toEqual([])
    await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalled())
    expect(storageMocks.setItem).toHaveBeenLastCalledWith(
      'character-storage',
      expect.objectContaining({
        state: { characters: [], unsupportedCharacters: [] },
      }),
    )
    unsubscribe()
  })

  test('persist rehydrate quarantines malformed current-version characters', () => {
    const malformed = {
      ...makeCharacterFixture({ id: 'malformed-current', name: 'Malformed Current' }),
      proficiencies: { armor: [] },
    }

    useCharacterStore.setState({
      characters: [malformed as unknown as ReturnType<typeof makeCharacterFixture>],
      activeCharacterId: malformed.id,
      activeCharacter: malformed as unknown as ReturnType<typeof makeCharacterFixture>,
    })

    useCharacterStore.getState().finishCharacterHydration()

    const state = useCharacterStore.getState()
    expect(state.characters).toEqual([])
    expect(state.activeCharacterId).toBeNull()
    expect(state.activeCharacter).toBeNull()
    expect(state.unsupportedCharacters).toEqual([malformed])
  })

  test('persist partialize stores characters and the durable unsupported quarantine', () => {
    const fixture = makeCharacterFixture({ id: 'persist-id', name: 'Persist' })
    useCharacterStore.setState({
      characters: [fixture],
      activeCharacterId: fixture.id,
      activeCharacter: fixture,
    })

    const storeWithPersist = useCharacterStore as unknown as {
      persist: {
        getOptions: () => {
          partialize?: (state: {
            characters: (typeof fixture)[]
            unsupportedCharacters: unknown[]
          }) => {
            characters: (typeof fixture)[]
            unsupportedCharacters: unknown[]
          }
        }
      }
      getState: () => {
        characters: (typeof fixture)[]
        unsupportedCharacters: unknown[]
      }
    }

    const partialize = storeWithPersist.persist.getOptions().partialize
    expect(partialize).toBeTypeOf('function')

    const persisted = partialize?.(storeWithPersist.getState())
    expect(persisted).toEqual({ characters: [fixture], unsupportedCharacters: [] })
  })
})
