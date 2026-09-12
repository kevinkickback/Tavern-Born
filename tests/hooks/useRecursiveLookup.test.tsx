import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useRawRecursiveLookup, useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e, Subclass5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('useRecursiveLookup', () => {
  afterEach(() => {
    useGameDataStore.setState({ gameData: null })
    useCharacterStore.setState({ activeCharacter: null, activeCharacterId: null, characters: [] })
  })

  test('indexes base items by source-qualified and name-only keys', () => {
    const baseItem: Item5e = {
      name: 'Base Relic',
      source: 'PHB',
      type: 'G',
      entries: ['Base item details.'],
    }
    useGameDataStore.setState({
      gameData: makeGameDataFixture({ itemsBase: [baseItem] }),
    })

    const { result } = renderHook(() => useRecursiveLookup())

    expect(result.current.items.get('base relic|phb')).toBe(baseItem)
    expect(result.current.items.get('base relic|')).toBe(baseItem)
  })

  test('limits character-scoped previews to the active character sources', () => {
    const allowedItem: Item5e = {
      name: 'Allowed Relic',
      source: 'PHB',
      type: 'G',
      entries: ['Allowed details.'],
    }
    const excludedItem: Item5e = {
      name: 'Excluded Relic',
      source: 'DMG',
      type: 'G',
      entries: ['Excluded details.'],
    }
    const character = makeCharacterFixture({ allowedSources: ['PHB'] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({ items: [allowedItem, excludedItem] }),
    })

    const { result } = renderHook(() => useRecursiveLookup())

    expect(result.current.items.get('allowed relic|phb')).toBe(allowedItem)
    expect(result.current.items.get('excluded relic|dmg')).toBeUndefined()
  })

  test('excludes source-disabled nested subclasses and subclass features', () => {
    const character = makeCharacterFixture({ allowedSources: ['PHB'] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        classes: [
          {
            name: 'Wizard',
            source: 'PHB',
            subclasses: [
              {
                name: 'War Magic',
                shortName: 'War Magic',
                source: 'XGE',
                className: 'Wizard',
                classSource: 'PHB',
                subclassFeatures: [{ name: 'Arcane Deflection', source: 'XGE' }],
              },
            ] as Subclass5e[],
          },
        ],
      }),
    })

    const { result } = renderHook(() => useRecursiveLookup())

    expect(result.current.subclasses.get('war magic|xge')).toBeUndefined()
    expect(result.current.subclassFeatures.get('arcane deflection|xge')).toBeUndefined()
  })

  test('shares filtered lookup maps across character-scoped consumers', () => {
    const gameData = makeGameDataFixture()
    useGameDataStore.setState({ gameData })

    const { result } = renderHook(() => [useRecursiveLookup(), useRecursiveLookup()] as const)

    expect(result.current[0]).toBe(result.current[1])
  })

  test('retains an explicit raw lookup for global content', () => {
    const rawItem: Item5e = {
      name: 'Global Relic',
      source: 'DMG',
      type: 'G',
      entries: ['Global details.'],
    }
    useGameDataStore.setState({
      gameData: makeGameDataFixture({ items: [rawItem] }),
    })

    const { result } = renderHook(() => useRawRecursiveLookup())

    expect(result.current.items.get('global relic|dmg')).toBe(rawItem)
  })
})
