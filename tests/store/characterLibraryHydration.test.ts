import { beforeEach, expect, test, vi } from 'vitest'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const storage = vi.hoisted(() => ({
  getItem: vi.fn<() => Promise<unknown>>(async () => null),
  setItem: vi.fn(async () => undefined),
  removeItem: vi.fn(async () => undefined),
}))
vi.mock('@/lib/storage/idb-storage', () => ({ createIdbStorage: () => storage }))

beforeEach(() => {
  vi.resetModules()
  storage.getItem.mockReset()
  storage.setItem.mockClear()
})

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
