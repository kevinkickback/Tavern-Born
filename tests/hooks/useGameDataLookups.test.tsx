import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import {
  useBackgroundLookup,
  useItemLookup,
  useItemPropertyLookup,
  useItemTypeLookup,
  useRaceLookup,
  useSkillList,
  useSkillToAbilityMap,
} from '@/hooks/data/useGameData'
import { buildGameDataLookups, getEntityLookupKey } from '@/lib/5etools/lookups'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('named game data lookup hooks', () => {
  afterEach(() => {
    useGameDataStore.setState({ gameData: null })
  })

  test('returns stable empty defaults while data is unavailable', () => {
    const { result, rerender } = renderHook(() => ({
      races: useRaceLookup(),
      backgrounds: useBackgroundLookup(),
      items: useItemLookup(),
      properties: useItemPropertyLookup(),
      types: useItemTypeLookup(),
      skillMap: useSkillToAbilityMap(),
      skills: useSkillList(),
    }))
    const first = result.current

    rerender()

    expect(result.current.races).toBe(first.races)
    expect(result.current.backgrounds).toBe(first.backgrounds)
    expect(result.current.items).toBe(first.items)
    expect(result.current.properties).toBe(first.properties)
    expect(result.current.types).toBe(first.types)
    expect(result.current.skillMap).toBe(first.skillMap)
    expect(result.current.skills).toBe(first.skills)
  })

  test('exposes all shared lookups built by ingestion', () => {
    const data = makeGameDataFixture({
      races: [{ name: 'Elf', source: 'PHB' }],
      backgrounds: [{ name: 'Sage', source: 'PHB' }],
      items: [{ name: 'Rope', source: 'PHB', type: 'G' }],
      itemProperties: [{ abbreviation: 'F', source: 'PHB', entries: [{ name: 'Finesse' }] }],
      itemTypes: [{ abbreviation: 'G', name: 'Adventuring Gear', source: 'PHB' }],
      skills: [{ name: 'Arcana', ability: 'int' }],
    })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    const { result } = renderHook(() => ({
      races: useRaceLookup(),
      backgrounds: useBackgroundLookup(),
      items: useItemLookup(),
      properties: useItemPropertyLookup(),
      types: useItemTypeLookup(),
      skillMap: useSkillToAbilityMap(),
      skills: useSkillList(),
    }))

    expect(result.current.races[getEntityLookupKey('Elf', 'PHB')]?.name).toBe('Elf')
    expect(result.current.backgrounds[getEntityLookupKey('Sage', 'PHB')]?.name).toBe('Sage')
    expect(result.current.items.get('rope|phb')?.name).toBe('Rope')
    expect(result.current.properties.F).toBe('Finesse')
    expect(result.current.types.G).toBe('Adventuring Gear')
    expect(result.current.skillMap.arcana).toBe('intelligence')
    expect(result.current.skills).toEqual(['arcana'])
  })
})
