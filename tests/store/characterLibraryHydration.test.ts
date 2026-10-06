import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const storage = vi.hoisted(() => ({
  getItem: vi.fn<() => Promise<unknown>>(async () => null),
  setItem: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  removeItem: vi.fn(async () => undefined),
}))
vi.mock('@/lib/storage/idb-storage', () => ({ createIdbStorage: () => storage }))

beforeEach(() => {
  vi.resetModules()
  storage.getItem.mockReset()
  storage.setItem.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.restoreAllMocks())

function delayHydration() {
  let finish: (characters: Character[]) => void = () => undefined
  storage.getItem.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = (characters) =>
          resolve({ state: { characters, unsupportedCharacters: [] }, version: 0 })
      }),
  )
  return (characters: Character[]) => finish(characters)
}

test('creation and import wait for initial hydration and retain existing records and identities', async () => {
  const finish = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const existing = makeCharacterFixture({ id: 'existing', name: 'Existing' })
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const imported = store.getState().importCharacters([existing])
  await Promise.resolve()
  expect(store.persist.hasHydrated()).toBe(false)
  expect(storage.setItem).not.toHaveBeenCalled()
  finish([existing])
  const [newCharacter, imports] = await Promise.all([created, imported])
  expect(store.getState().characters.map((character) => [character.id, character.name])).toEqual([
    ['existing', 'Existing'],
    [newCharacter.id, 'Created'],
    [imports[0].id, 'Existing (Imported)'],
  ])
  expect(imports[0].id).not.toBe(existing.id)
  expect(store.persist.hasHydrated()).toBe(true)
  expect(storage.setItem).toHaveBeenCalledTimes(2)
})

test('a deletion requested before hydration removes the loaded record in one durable write', async () => {
  const finish = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const deleted = store.getState().deleteCharacter('deleted')
  await Promise.resolve()
  expect(storage.setItem).not.toHaveBeenCalled()
  finish([
    makeCharacterFixture({ id: 'deleted', name: 'Deleted' }),
    makeCharacterFixture({ id: 'retained', name: 'Retained' }),
  ])
  await deleted
  expect(store.getState().characters.map((character) => [character.id, character.name])).toEqual([
    ['retained', 'Retained'],
  ])
  expect(storage.setItem).toHaveBeenCalledTimes(1)
})

test('a superseding hydration keeps queued mutations waiting for its latest loaded library', async () => {
  const finishInitial = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const finishLatest = delayHydration()
  const rehydrated = store.persist.rehydrate()
  finishInitial([makeCharacterFixture({ id: 'superseded', name: 'Superseded' })])
  await Promise.resolve()
  expect(store.persist.hasHydrated()).toBe(false)
  expect(storage.setItem).not.toHaveBeenCalled()
  finishLatest([makeCharacterFixture({ id: 'latest', name: 'Latest' })])
  await rehydrated
  await created
  expect(store.getState().characters.map((character) => character.name)).toEqual([
    'Latest',
    'Created',
  ])
})

test('an older failed read cannot reject mutations waiting for a newer hydration', async () => {
  let rejectInitial: (error: Error) => void = () => undefined
  storage.getItem.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectInitial = reject
      }),
  )
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const finishLatest = delayHydration()
  const rehydrated = store.persist.rehydrate()
  rejectInitial(new Error('Superseded read failed'))
  await Promise.resolve()
  expect(storage.setItem).not.toHaveBeenCalled()
  finishLatest([makeCharacterFixture({ id: 'latest', name: 'Latest' })])
  await rehydrated
  await created
  expect(store.getState().characters.map((character) => character.name)).toEqual([
    'Latest',
    'Created',
  ])
})

test('an older read completing after the latest write cannot merge or persist stale records', async () => {
  const finishInitial = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const finishLatest = delayHydration()
  const rehydrated = store.persist.rehydrate()
  await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(2))
  finishLatest([makeCharacterFixture({ id: 'latest', name: 'Latest' })])
  await rehydrated
  await created
  const committed = store.getState().characters
  expect(committed.map((character) => character.name)).toEqual(['Latest', 'Created'])
  expect(storage.setItem).toHaveBeenCalledTimes(1)

  finishInitial([makeCharacterFixture({ id: 'superseded', name: 'Superseded' })])
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(store.getState().characters).toBe(committed)
  expect(store.getState().unsupportedCharacters).toEqual([])
  expect(storage.setItem).toHaveBeenCalledTimes(1)
  expect(store.persist.hasHydrated()).toBe(true)
})

test.each([
  false,
  true,
])('reload waits for a running transaction, including rejection=%s', async (rejectWrite) => {
  storage.getItem.mockResolvedValueOnce(null)
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const saved = await store
    .getState()
    .addCharacter(makeCharacterFixture({ id: 'saved', name: 'Saved' }))
  let durable: { characters: Character[]; unsupportedCharacters: unknown[] } = {
    characters: [saved],
    unsupportedCharacters: [],
  }
  storage.setItem.mockImplementation((_name, value) => {
    durable = (value as { state: typeof durable }).state
    return Promise.resolve()
  })
  let finishWrite: () => void = () => undefined
  storage.setItem.mockImplementationOnce(
    (_name, value) =>
      new Promise((resolve, reject) => {
        finishWrite = () => {
          if (rejectWrite) reject(new Error('Storage unavailable'))
          else {
            durable = (value as { state: typeof durable }).state
            resolve()
          }
        }
      }),
  )
  storage.setItem.mockClear()
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const completion = rejectWrite ? expect(created).rejects.toThrow('Storage unavailable') : created
  await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))

  storage.getItem.mockClear()
  let finishRead: () => void = () => undefined
  storage.getItem.mockImplementationOnce(() => {
    const snapshot = durable
    return new Promise((resolve) => {
      finishRead = () => resolve({ state: snapshot, version: 0 })
    })
  })
  const rehydrated = store.persist.rehydrate()
  await Promise.resolve()
  const readsBeforeAcknowledgment = storage.getItem.mock.calls.length
  finishWrite()
  await completion
  await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1))
  finishRead()
  await rehydrated
  await store.setState({})
  const names = rejectWrite ? ['Saved'] : ['Saved', 'Created']
  expect(store.getState().characters.map((character) => character.name)).toEqual(names)
  expect(durable.characters.map((character) => character.name)).toEqual(names)
  expect(readsBeforeAcknowledgment).toBe(0)
  await store.getState().createNewCharacter({ name: 'Later' })
  expect(durable.characters.map((character) => character.name)).toEqual([...names, 'Later'])
})

test('a reload requested by a save subscriber waits for the acknowledged snapshot', async () => {
  storage.getItem.mockResolvedValueOnce(null)
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const saved = await store
    .getState()
    .addCharacter(makeCharacterFixture({ id: 'saved', name: 'Saved' }))
  let durable: { characters: Character[]; unsupportedCharacters: unknown[] } = {
    characters: [saved],
    unsupportedCharacters: [],
  }
  storage.getItem.mockImplementation(() => Promise.resolve({ state: durable, version: 0 }))
  storage.setItem.mockImplementation((_name, value) => {
    durable = (value as { state: typeof durable }).state
    return Promise.resolve()
  })
  store.getState().setActiveCharacter(saved.id)
  store.getState().updateActiveCharacter({ name: 'Draft' })
  storage.getItem.mockClear()
  storage.setItem.mockClear()
  let finishWrite: () => void = () => undefined
  storage.setItem.mockImplementationOnce(
    (_name, value) =>
      new Promise((resolve) => {
        finishWrite = () => {
          durable = (value as { state: typeof durable }).state
          resolve()
        }
      }),
  )
  let rehydrated: void | Promise<void> | null = null
  const unsubscribe = store.subscribe(() => {
    unsubscribe()
    rehydrated = store.persist.rehydrate()
  })
  const committed = store.getState().saveActiveCharacter()
  await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))
  const readsBeforeAcknowledgment = storage.getItem.mock.calls.length
  finishWrite()
  await committed
  expect(rehydrated).not.toBeNull()
  await rehydrated
  await store.setState({})
  expect(readsBeforeAcknowledgment).toBe(0)
  expect(store.getState().characters[0].name).toBe('Draft')
  expect(durable.characters[0].name).toBe('Draft')
})

test('a hydration completion listener can start another read before queued mutations proceed', async () => {
  const finishInitial = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const finishLatest = delayHydration()
  let rehydrated: void | Promise<void> | null = null
  const unsubscribe = store.persist.onFinishHydration(() => {
    unsubscribe()
    rehydrated = store.persist.rehydrate()
  })
  finishInitial([makeCharacterFixture({ id: 'initial', name: 'Initial' })])
  await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(2))
  expect(storage.setItem).not.toHaveBeenCalled()
  finishLatest([makeCharacterFixture({ id: 'latest', name: 'Latest' })])
  expect(rehydrated).not.toBeNull()
  await rehydrated
  await created
  expect(store.getState().characters.map((character) => character.name)).toEqual([
    'Latest',
    'Created',
  ])
})

test('a state subscriber can restart hydration during normalization without releasing queued writes', async () => {
  const finishInitial = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const finishLatest = delayHydration()
  let notifications = 0
  let rehydrated: void | Promise<void> | null = null
  const unsubscribe = store.subscribe(() => {
    if (++notifications !== 2) return
    unsubscribe()
    rehydrated = store.persist.rehydrate()
  })
  finishInitial([makeCharacterFixture({ id: 'initial', name: 'Initial' })])
  await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(2))
  expect(storage.setItem).not.toHaveBeenCalled()
  finishLatest([makeCharacterFixture({ id: 'latest', name: 'Latest' })])
  expect(rehydrated).not.toBeNull()
  await rehydrated
  await created
  expect(store.getState().characters.map((character) => character.name)).toEqual([
    'Latest',
    'Created',
  ])
})

test('a normalization failure rejects queued mutations before releasing the read gate', async () => {
  const finish = delayHydration()
  const { useCharacterStore: store } = await import('@/store/characterStore')
  vi.spyOn(store.getState(), 'finishCharacterHydration').mockImplementationOnce(() => {
    throw new Error('Normalization unavailable')
  })
  const created = store.getState().createNewCharacter({ name: 'Created' })
  const rejection = expect(created).rejects.toThrow('Character library could not be loaded')
  finish([makeCharacterFixture({ id: 'existing', name: 'Existing' })])
  await rejection
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(store.persist.hasHydrated()).toBe(false)
})

test('a failed hydration rejects mutations without writing and permits retry after successful rehydration', async () => {
  let rejectRead: (error: Error) => void = () => undefined
  storage.getItem.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectRead = reject
      }),
  )
  const { useCharacterStore: store } = await import('@/store/characterStore')
  const created = store.getState().createNewCharacter({ name: 'Recoverable' })
  const rejection = expect(created).rejects.toThrow('Character library could not be loaded')
  rejectRead(new Error('Storage unavailable'))
  await rejection
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(store.getState().characters).toEqual([])

  const finish = delayHydration()
  const rehydrated = store.persist.rehydrate()
  const retry = store.getState().createNewCharacter({ name: 'Recoverable' })
  await Promise.resolve()
  expect(storage.setItem).not.toHaveBeenCalled()
  finish([makeCharacterFixture({ id: 'existing', name: 'Existing' })])
  await rehydrated
  await retry
  expect(store.getState().characters.map((character) => character.name)).toEqual([
    'Existing',
    'Recoverable',
  ])
})
