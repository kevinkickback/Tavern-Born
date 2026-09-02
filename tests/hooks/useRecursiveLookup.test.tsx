import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('useRecursiveLookup', () => {
  afterEach(() => {
    useGameDataStore.setState({ gameData: null })
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
})
