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
  beforeEach(async () => {
    storageMocks.getItem.mockReset().mockResolvedValue(null)
    storageMocks.setItem.mockReset().mockResolvedValue(undefined)
    storageMocks.removeItem.mockReset().mockResolvedValue(undefined)
    await useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      isActiveCharacterDirty: false,
      unsupportedCharacters: [],
    })
  })

  describe('durable library transactions', () => {
    test('an ignored clean-correction failure stays handled and dirty until explicit Save retry', async () => {
      const character = makeCharacterFixture({ id: 'correction-retry', name: 'Saved' })
      await useCharacterStore.setState({ characters: [character] })
      useCharacterStore.getState().setActiveCharacter(character.id)
      storageMocks.setItem.mockClear()
      storageMocks.setItem.mockRejectedValueOnce(new Error('Storage unavailable'))
      void useCharacterStore.getState().reconcileCharacter(character.id, { name: 'Corrected' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(useCharacterStore.getState().characters[0].name).toBe('Saved')
      expect(useCharacterStore.getState().activeCharacter?.name).toBe('Corrected')
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
      expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
      await useCharacterStore.getState().saveActiveCharacter()
      expect(useCharacterStore.getState().characters[0].name).toBe('Corrected')
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
    })

    test('an already queued transaction continues after an earlier write fails', async () => {
      const first = makeCharacterFixture({ id: 'first', name: 'First' })
      await useCharacterStore.setState({ characters: [first] })
      storageMocks.setItem.mockClear()
      let rejectWrite: (error: Error) => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectWrite = reject
          }),
      )
      const addition = useCharacterStore
        .getState()
        .addCharacter(makeCharacterFixture({ id: 'failed', name: 'Failed' }))
      const rejection = expect(addition).rejects.toThrow('Storage unavailable')
      const update = useCharacterStore
        .getState()
        .updateCharacter(first.id, { name: 'Updated First' })
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      rejectWrite(new Error('Storage unavailable'))
      await rejection
      await update
      expect(
        useCharacterStore.getState().characters.map((character) => [character.id, character.name]),
      ).toEqual([['first', 'Updated First']])
      expect(storageMocks.setItem).toHaveBeenCalledTimes(2)
    })
    test('serializes multiple clean corrections and leaves the final acknowledged draft clean', async () => {
      const character = makeCharacterFixture({ id: 'corrected' })
      await useCharacterStore.setState({
        characters: [character],
        activeCharacterId: character.id,
        activeCharacter: character,
      })
      storageMocks.setItem.mockClear()
      let finishWrite: () => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve
          }),
      )
      const first = useCharacterStore
        .getState()
        .reconcileCharacter(character.id, { name: 'Corrected name' })
      const second = useCharacterStore.getState().reconcileCharacter(character.id, {
        movement: { ...character.movement, speeds: { walk: 35 } },
      })
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
      finishWrite()
      await Promise.all([first, second])
      expect(useCharacterStore.getState().characters[0]).toMatchObject({
        name: 'Corrected name',
        movement: { speeds: { walk: 35 } },
      })
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
      expect(storageMocks.setItem).toHaveBeenCalledTimes(2)
    })

    test('keeps user edits and later corrections out of a pending clean correction write', async () => {
      const character = makeCharacterFixture({ id: 'corrected' })
      await useCharacterStore.setState({
        characters: [character],
        activeCharacterId: character.id,
        activeCharacter: character,
      })
      storageMocks.setItem.mockClear()
      let finishWrite: () => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve
          }),
      )
      const correction = useCharacterStore
        .getState()
        .reconcileCharacter(character.id, { name: 'Corrected name' })
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      useCharacterStore.getState().updateActiveCharacter({ name: 'Player edit' })
      useCharacterStore.getState().reconcileCharacter(character.id, {
        movement: { ...character.movement, speeds: { walk: 35 } },
      })
      finishWrite()
      await correction
      expect(useCharacterStore.getState().characters[0]).toMatchObject({
        name: 'Corrected name',
        movement: { speeds: { walk: 30 } },
      })
      expect(useCharacterStore.getState().activeCharacter).toMatchObject({
        name: 'Player edit',
        movement: { speeds: { walk: 35 } },
      })
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
      expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
    })

    test.each([
      'create',
      'duplicate',
      'delete',
      'bulk delete',
      'inactive update',
      'replace',
    ] as const)('preserves the library and active draft when %s fails, then allows retry', async (operation) => {
      const first = makeCharacterFixture({ id: 'first', name: 'First' })
      const second = makeCharacterFixture({ id: 'second', name: 'Second' })
      const draft = { ...first, name: 'Unsaved First' }
      await useCharacterStore.setState({
        characters: [first, second],
        activeCharacterId: first.id,
        activeCharacter: draft,
        isActiveCharacterDirty: true,
      })
      storageMocks.setItem.mockClear()
      let rejectWrite: (error: Error) => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectWrite = reject
          }),
      )
      const store = useCharacterStore.getState()
      const actions = {
        create: () => store.addCharacter(makeCharacterFixture({ id: 'new', name: 'New' })),
        duplicate: () => store.duplicateCharacter(first.id),
        delete: () => store.deleteCharacter(first.id),
        'bulk delete': () => store.deleteCharacters([first.id, second.id]),
        'inactive update': () => store.updateCharacter(second.id, { name: 'Updated Second' }),
        replace: () => store.setCharacters([second]),
      }
      const pending = actions[operation]()
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      expect(useCharacterStore.getState().characters).toEqual([first, second])
      expect(useCharacterStore.getState().activeCharacter).toBe(draft)
      const rejection = expect(pending).rejects.toThrow('Storage full')
      rejectWrite(new Error('Storage full'))
      await rejection
      expect(useCharacterStore.getState().characters).toEqual([first, second])
      expect(useCharacterStore.getState().activeCharacter).toBe(draft)
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
      expect(storageMocks.setItem).toHaveBeenCalledTimes(1)

      await actions[operation]()
      const expectedNames = {
        create: ['First', 'Second', 'New'],
        duplicate: ['First', 'Second', 'First (Copy)'],
        delete: ['Second'],
        'bulk delete': [],
        'inactive update': ['First', 'Updated Second'],
        replace: ['Second'],
      }
      expect(useCharacterStore.getState().characters.map((character) => character.name)).toEqual(
        expectedNames[operation],
      )
      expect(storageMocks.setItem).toHaveBeenCalledTimes(2)
    })

    test('serializes overlapping additions, duplication, imports, updates and one batch deletion', async () => {
      const first = makeCharacterFixture({ id: 'first', name: 'First' })
      const second = makeCharacterFixture({ id: 'second', name: 'Second' })
      await useCharacterStore.setState({
        characters: [first, second],
        activeCharacterId: first.id,
        activeCharacter: first,
      })
      storageMocks.setItem.mockClear()
      let finishWrite: () => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve
          }),
      )
      const store = useCharacterStore.getState()
      const addition = store.addCharacter(makeCharacterFixture({ id: 'added', name: 'Added' }))
      const copy = store.duplicateCharacter(first.id)
      const imported = store.importCharacters([
        makeCharacterFixture({ id: 'added', name: 'Added' }),
      ])
      const updated = store.updateCharacter(second.id, { name: 'Updated Second' })
      const deleted = store.deleteCharacters(['added', first.id])
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      store.updateActiveCharacter({ name: 'Pending draft edit' })
      expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
      expect(useCharacterStore.getState().characters.map((character) => character.name)).toEqual([
        'First',
        'Second',
      ])
      finishWrite()
      const [, copied, imports] = await Promise.all([addition, copy, imported, updated, deleted])
      expect(copied.name).toBe('First (Copy)')
      expect(imports[0]?.name).toBe('Added (Imported)')
      expect(imports[0]?.id).not.toBe('added')
      expect(useCharacterStore.getState().characters.map((character) => character.name)).toEqual([
        'Updated Second',
        'First (Copy)',
        'Added (Imported)',
      ])
      expect(storageMocks.setItem).toHaveBeenCalledTimes(5)
      expect(useCharacterStore.getState().activeCharacterId).toBeNull()
    })

    test('saves the requested draft after a queued write even if another character becomes active', async () => {
      const first = makeCharacterFixture({ id: 'first', name: 'First' })
      const second = makeCharacterFixture({ id: 'second', name: 'Second' })
      await useCharacterStore.setState({
        characters: [first, second],
        activeCharacterId: first.id,
        activeCharacter: { ...first, name: 'Requested First' },
        isActiveCharacterDirty: true,
      })
      storageMocks.setItem.mockClear()
      let finishWrite: () => void = () => undefined
      storageMocks.setItem.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve
          }),
      )
      const added = useCharacterStore.getState().addCharacter(makeCharacterFixture({ id: 'third' }))
      const saved = useCharacterStore.getState().saveActiveCharacter()
      useCharacterStore.getState().setActiveCharacter(second.id)
      useCharacterStore.getState().updateActiveCharacter({ name: 'Unsaved Second' })
      await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
      finishWrite()
      await Promise.all([added, saved])
      expect(useCharacterStore.getState().characters.map((character) => character.name)).toEqual([
        'Requested First',
        'Second',
        'Fixture Character',
      ])
      expect(useCharacterStore.getState().activeCharacter?.name).toBe('Unsaved Second')
      expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
    })

    test('does not resurrect a character deleted before its queued save starts', async () => {
      const first = makeCharacterFixture({ id: 'first', name: 'First' })
      await useCharacterStore.setState({
        characters: [first],
        activeCharacterId: first.id,
        activeCharacter: first,
      })
      const deleted = useCharacterStore.getState().deleteCharacter(first.id)
      const saved = useCharacterStore.getState().saveActiveCharacter()
      const rejected = expect(saved).rejects.toThrow('no longer in the library')
      await deleted
      await rejected
      expect(useCharacterStore.getState().characters).toEqual([])
      expect(useCharacterStore.getState().activeCharacterId).toBeNull()
    })

    test('does not write the saved library for draft edits or active selection', async () => {
      const first = makeCharacterFixture({ id: 'first' })
      await useCharacterStore.setState({ characters: [first] })
      storageMocks.setItem.mockClear()
      useCharacterStore.getState().setActiveCharacter(first.id)
      useCharacterStore.getState().updateCharacter(first.id, { name: 'Draft' })
      useCharacterStore.getState().updateActiveCharacterDetails({ alignment: 'Neutral' })
      await Promise.resolve()
      expect(storageMocks.setItem).not.toHaveBeenCalled()
      await useCharacterStore.getState().saveActiveCharacter()
      expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
    })
  })

  test('validateCharacterData accepts full character payload', () => {
    const fixture = makeCharacterFixture()
    expect(validateCharacterData(fixture)).toBeNull()
  })

  test('validateCharacterData rejects malformed payload', () => {
    expect(validateCharacterData({ foo: 'bar' })).toContain('Invalid character structure')
  })

  test.each([
    0,
    1,
    3,
    4,
    '2',
    'invalid',
  ])('rejects unsupported schema version %s', (schemaVersion) => {
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

  test('createNewCharacter adds a character and returns it', async () => {
    const created = await useCharacterStore.getState().createNewCharacter({ name: 'New Hero' })

    const state = useCharacterStore.getState()

    expect(created.name).toBe('New Hero')
    expect(created.originSystem).toBe('2014')
    expect(state.characters).toHaveLength(1)
    expect(state.characters[0]?.id).toBe(created.id)
  })

  test('addCharacter assigns a fresh ID when an imported ID already exists', async () => {
    const existing = makeCharacterFixture({ id: 'duplicate-id', name: 'Original' })
    const imported = makeCharacterFixture({ id: 'duplicate-id', name: 'Imported Copy' })
    await useCharacterStore.setState({ characters: [existing] })

    const added = await useCharacterStore.getState().addCharacter(imported)
    const state = useCharacterStore.getState()

    expect(added.id).not.toBe(existing.id)
    expect(state.characters).toHaveLength(2)
    expect(new Set(state.characters.map((character) => character.id)).size).toBe(2)
    expect(state.characters[1]).toEqual(added)
  })

  test('importCharacters waits for one durable write of the whole batch', async () => {
    const existing = makeCharacterFixture({ id: 'duplicate-id', name: 'Original' })
    await useCharacterStore.setState({ characters: [existing] })
    storageMocks.setItem.mockClear()
    let finishWrite: (() => void) | undefined
    storageMocks.setItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve
        }),
    )

    const importPromise = useCharacterStore
      .getState()
      .importCharacters([
        makeCharacterFixture({ id: 'duplicate-id', name: 'First' }),
        makeCharacterFixture({ id: 'second-id', name: 'Second' }),
      ])
    await vi.waitFor(() => expect(storageMocks.setItem).toHaveBeenCalledTimes(1))
    expect(useCharacterStore.getState().characters).toHaveLength(1)
    finishWrite?.()

    const imported = await importPromise
    expect(imported).toHaveLength(2)
    expect(imported[0]?.id).not.toBe(existing.id)
    expect(
      new Set(useCharacterStore.getState().characters.map((character) => character.id)).size,
    ).toBe(3)
    expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
  })

  test('importCharacters resolves names against the latest committed library', async () => {
    const addPromise = useCharacterStore
      .getState()
      .addCharacter(makeCharacterFixture({ id: 'newly-added', name: 'Hero' }))
    const importPromise = useCharacterStore
      .getState()
      .importCharacters([
        makeCharacterFixture({ id: 'first-import', name: 'Hero' }),
        makeCharacterFixture({ id: 'second-import', name: 'Hero' }),
      ])
    await addPromise
    const imported = await importPromise
    expect(imported.map((character) => character.name)).toEqual([
      'Hero (Imported)',
      'Hero (Imported 2)',
    ])
    expect(useCharacterStore.getState().characters.map((character) => character.name)).toEqual([
      'Hero',
      'Hero (Imported)',
      'Hero (Imported 2)',
    ])
  })

  test('importCharacters leaves the batch unpublished when persistence fails', async () => {
    const existing = makeCharacterFixture({ id: 'existing', name: 'Original' })
    await useCharacterStore.setState({ characters: [existing] })
    storageMocks.setItem.mockClear()
    storageMocks.setItem.mockRejectedValueOnce(
      new DOMException('Storage full', 'QuotaExceededError'),
    )

    await expect(
      useCharacterStore
        .getState()
        .importCharacters([makeCharacterFixture({ id: 'imported', name: 'Imported' })]),
    ).rejects.toMatchObject({ name: 'QuotaExceededError' })
    expect(useCharacterStore.getState().characters).toEqual([existing])
    expect(storageMocks.setItem).toHaveBeenCalledTimes(1)
  })

  test('setCharacters repairs duplicate IDs from persisted data', async () => {
    const first = makeCharacterFixture({ id: 'duplicate-id', name: 'First' })
    const second = makeCharacterFixture({ id: 'duplicate-id', name: 'Second' })

    await useCharacterStore.getState().setCharacters([first, second])

    const characters = useCharacterStore.getState().characters
    expect(characters[0]?.id).toBe('duplicate-id')
    expect(characters[1]?.id).not.toBe('duplicate-id')
    expect(new Set(characters.map((character) => character.id)).size).toBe(2)
  })

  test('updateCharacter updates active character as draft and not persisted list', async () => {
    const existing = makeCharacterFixture({ id: 'c1', name: 'Before' })
    await useCharacterStore.setState({
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

  test('reconcileCharacter keeps a clean system correction synchronized and clean', async () => {
    const existing = makeCharacterFixture({ id: 'clean-reconciliation' })
    await useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
      isActiveCharacterDirty: false,
    })

    await useCharacterStore.getState().reconcileCharacter(existing.id, {
      movement: { ...existing.movement, speeds: { walk: 35 } },
    })

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.movement.speeds.walk).toBe(35)
    expect(state.characters[0]?.movement.speeds.walk).toBe(35)
    expect(state.hasUnsavedChanges()).toBe(false)
  })

  test('reconcileCharacter never persists a system correction over an existing dirty draft', async () => {
    const existing = makeCharacterFixture({
      id: 'dirty-reconciliation',
      name: 'Persisted Name',
    })
    await useCharacterStore.setState({
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
    await useCharacterStore.setState({
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
    await useCharacterStore.setState({
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
    await useCharacterStore.setState({
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
    await useCharacterStore.setState({
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
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))

    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(true)
    finishWrite?.()
    await save
    expect(useCharacterStore.getState().characters[0]?.name).toBe('After')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })

  test('preserves the saved snapshot and dirty draft when durable persistence fails', async () => {
    const existing = makeCharacterFixture({ id: 'failed-save', name: 'Before' })
    const draft = { ...existing, name: 'After' }
    await useCharacterStore.setState({
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
    await useCharacterStore.setState({
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
    await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'))
    useCharacterStore.getState().updateCharacter(existing.id, { name: 'Edited Again' })
    finishWrite?.()
    await save

    const state = useCharacterStore.getState()
    expect(state.characters[0]?.name).toBe('Saving')
    expect(state.activeCharacter?.name).toBe('Edited Again')
    expect(state.hasUnsavedChanges()).toBe(true)
  })

  test('updateCharacter updates non-active character directly', async () => {
    const a = makeCharacterFixture({ id: 'c3', name: 'A' })
    const b = makeCharacterFixture({ id: 'c4', name: 'B' })
    await useCharacterStore.setState({
      characters: [a, b],
      activeCharacterId: a.id,
      activeCharacter: a,
    })

    await useCharacterStore.getState().updateCharacter(b.id, { name: 'B2' })

    const state = useCharacterStore.getState()
    expect(state.characters.find((c) => c.id === 'c4')?.name).toBe('B2')
    expect(state.activeCharacter?.name).toBe('A')
  })

  test('setActiveCharacter hydrates activeCharacter from characters list', async () => {
    const a = makeCharacterFixture({ id: 'c5', name: 'Pick Me' })
    await useCharacterStore.setState({
      characters: [a],
      activeCharacterId: null,
      activeCharacter: null,
    })

    useCharacterStore.getState().setActiveCharacter('c5')

    expect(useCharacterStore.getState().activeCharacter?.name).toBe('Pick Me')
  })

  test('updateActiveCharacterDetails merges details object', async () => {
    const existing = makeCharacterFixture({
      id: 'c6',
      details: { alignment: 'Neutral', personality: 'Calm' },
    })
    await useCharacterStore.setState({
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

  test('deleteCharacter clears active selection when deleting active id', async () => {
    const existing = makeCharacterFixture({ id: 'c7' })
    await useCharacterStore.setState({
      characters: [existing],
      activeCharacterId: existing.id,
      activeCharacter: existing,
    })

    await useCharacterStore.getState().deleteCharacter(existing.id)

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

    await useCharacterStore.setState({
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

  test('persist rehydrate quarantines malformed current-version characters', async () => {
    const malformed = {
      ...makeCharacterFixture({ id: 'malformed-current', name: 'Malformed Current' }),
      proficiencies: { armor: [] },
    }

    await useCharacterStore.setState({
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

  test('persist partialize stores characters and the durable unsupported quarantine', async () => {
    const fixture = makeCharacterFixture({ id: 'persist-id', name: 'Persist' })
    await useCharacterStore.setState({
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
