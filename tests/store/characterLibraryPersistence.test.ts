import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import { useCharacterStore } from '@/store/characterStore'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.unmock('@/lib/storage/idb-storage')

const reader = createIdbStorage<{ characters: Character[]; unsupportedCharacters: unknown[] }>()
const readCharacters = async () => (await reader.getItem('character-storage'))?.state.characters

describe('acknowledged character library in IndexedDB', () => {
  beforeEach(async () => {
    await vi.waitFor(() => expect(useCharacterStore.persist.hasHydrated()).toBe(true))
    await useCharacterStore.persist.clearStorage()
    await useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      isActiveCharacterDirty: false,
      unsupportedCharacters: [],
    })
  })

  test('a new character is available to a fresh storage read when creation completes', async () => {
    const created = await useCharacterStore.getState().createNewCharacter({ name: 'Durable Hero' })
    expect(await readCharacters()).toEqual([created])
  })

  test('overlapping duplicates receive independent identities and collision-free names', async () => {
    const source = await useCharacterStore
      .getState()
      .addCharacter(makeCharacterFixture({ id: 'source', name: 'Hero' }))
    const [first, second] = await Promise.all([
      useCharacterStore.getState().duplicateCharacter(source.id),
      useCharacterStore.getState().duplicateCharacter(source.id),
    ])
    const saved = await readCharacters()
    expect(saved?.map((character) => character.name)).toEqual([
      'Hero',
      'Hero (Copy)',
      'Hero (Copy 2)',
    ])
    expect(new Set(saved?.map((character) => character.id)).size).toBe(3)
    expect(first.hitPoints).toEqual(source.hitPoints)
    expect(second.hitPoints).toEqual(source.hitPoints)
    expect(first.hitPoints).not.toBe(source.hitPoints)
  })

  test('inactive updates and batch deletion commit before their promises resolve', async () => {
    const characters = await useCharacterStore
      .getState()
      .importCharacters([
        makeCharacterFixture({ id: 'first', name: 'First' }),
        makeCharacterFixture({ id: 'second', name: 'Second' }),
        makeCharacterFixture({ id: 'third', name: 'Third' }),
      ])
    await useCharacterStore.getState().updateCharacter(characters[1].id, { name: 'Updated Second' })
    expect((await readCharacters())?.map((character) => character.name)).toEqual([
      'First',
      'Updated Second',
      'Third',
    ])
    await useCharacterStore.getState().deleteCharacters([characters[0].id, characters[2].id])
    expect((await readCharacters())?.map((character) => [character.id, character.name])).toEqual([
      ['second', 'Updated Second'],
    ])
  })

  test('draft-only changes stay out of durable storage until an acknowledged save', async () => {
    const saved = await useCharacterStore.getState().createNewCharacter({ name: 'Saved Hero' })
    useCharacterStore.getState().setActiveCharacter(saved.id)
    useCharacterStore.getState().updateActiveCharacter({ name: 'Draft Hero' })
    expect((await readCharacters())?.[0].name).toBe('Saved Hero')
    await useCharacterStore.getState().saveActiveCharacter()
    expect((await readCharacters())?.[0].name).toBe('Draft Hero')
    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })
})
