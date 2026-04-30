import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useAvailableProficiencies } from '@/hooks/data/useAvailableProficiencies'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetStores() {
  useCharacterStore.setState({ characters: [], activeCharacterId: null, activeCharacter: null })
  useGameDataStore.setState({ gameData: null })
}

function makeMinimalGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    classes: [],
    races: [],
    backgrounds: [],
    spells: [],
    feats: [],
    items: [],
    itemsBase: [],
    classFeatures: [],
    actions: [],
    conditions: [],
    deities: [],
    skills: [],
    senses: [],
    languages: [],
    magicvariants: [],
    optionalfeatures: [],
    variantrules: [],
    trapHazards: [],
    rewards: [],
    cultsBoons: [],
    sources: [],
    ...overrides,
  }
}

describe('useAvailableProficiencies', () => {
  beforeEach(resetStores)

  test('returns empty lists when game data is not loaded', () => {
    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.armor).toEqual([])
    expect(result.current.weapons).toEqual([])
    expect(result.current.tools).toEqual([])
    expect(result.current.languages).toEqual([])
  })

  test('collects armor proficiencies from class startingProficiencies', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Fighter',
            source: 'PHB',
            startingProficiencies: { armor: ['light armor', 'medium armor', 'shields'] },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.armor).toContain('light armor')
    expect(result.current.armor).toContain('medium armor')
    expect(result.current.armor).toContain('shields')
  })

  test('collects weapon proficiencies from class startingProficiencies', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Rogue',
            source: 'PHB',
            startingProficiencies: { weapons: ['dagger', 'shortsword', 'hand crossbow'] },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.weapons).toContain('dagger')
    expect(result.current.weapons).toContain('shortsword')
  })

  test('collects tool proficiencies from class startingProficiencies', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Rogue',
            source: 'PHB',
            startingProficiencies: { tools: ["thieves' tools"] },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.tools.some((t) => t.toLowerCase().includes('thieves'))).toBe(true)
  })

  test('collects languages from game data languages list', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        languages: [
          { name: 'Common', source: 'PHB', type: 'standard' },
          { name: 'Elvish', source: 'PHB', type: 'standard' },
          { name: 'Dwarvish', source: 'PHB', type: 'standard' },
        ] as never,
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.languages).toContain('Common')
    expect(result.current.languages).toContain('Elvish')
  })

  test('standardLanguages contains only languages with type "standard"', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        languages: [
          { name: 'Common', source: 'PHB', type: 'standard' },
          { name: 'Deep Speech', source: 'PHB', type: 'exotic' },
        ] as never,
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.standardLanguages).toContain('Common')
    expect(result.current.standardLanguages).not.toContain('Deep Speech')
  })

  test('isStandardLanguage returns true for standard languages, false for exotic', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        languages: [
          { name: 'Common', source: 'PHB', type: 'standard' },
          { name: 'Deep Speech', source: 'PHB', type: 'exotic' },
        ] as never,
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.isStandardLanguage('Common')).toBe(true)
    expect(result.current.isStandardLanguage('common')).toBe(true) // case-insensitive
    expect(result.current.isStandardLanguage('Deep Speech')).toBe(false)
  })

  test('deduplicates proficiencies from multiple classes', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Fighter',
            source: 'PHB',
            startingProficiencies: {
              armor: ['light armor', 'shields'],
              weapons: ['simple weapons'],
            },
          } as never,
          {
            name: 'Paladin',
            source: 'PHB',
            startingProficiencies: {
              armor: ['light armor', 'heavy armor'],
              weapons: ['simple weapons', 'martial weapons'],
            },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    // 'light armor' should appear only once despite two classes having it
    expect(result.current.armor.filter((a) => a === 'light armor')).toHaveLength(1)
    // 'simple weapons' deduplicated
    expect(result.current.weapons.filter((w) => w === 'simple weapons')).toHaveLength(1)
  })

  test('filters out narrative weapon strings (those with "that have", "property", etc.)', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Monk',
            source: 'PHB',
            startingProficiencies: {
              weapons: ['shortsword', 'simple weapons that have the light property'],
            },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.weapons).toContain('shortsword')
    expect(result.current.weapons.some((w) => w.includes('that have'))).toBe(false)
  })

  test('applies allowedSources filter when character has allowedSources set', () => {
    const character = makeCharacterFixture({ allowedSources: ['PHB'] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Fighter',
            source: 'PHB',
            startingProficiencies: { armor: ['light armor'], weapons: [] },
          } as never,
          {
            name: 'BloodHunter',
            source: 'MPMM',
            startingProficiencies: { armor: ['medium armor'], weapons: [] },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    expect(result.current.armor).toContain('light armor')
    expect(result.current.armor).not.toContain('medium armor')
  })

  test('returns sorted arrays', () => {
    useGameDataStore.setState({
      gameData: makeMinimalGameData({
        classes: [
          {
            name: 'Paladin',
            source: 'PHB',
            startingProficiencies: {
              armor: ['shields', 'heavy armor', 'light armor'],
              weapons: [],
            },
          } as never,
        ],
      }) as never,
    })

    const { result } = renderHook(() => useAvailableProficiencies())
    const armor = result.current.armor
    expect(armor).toEqual([...armor].sort())
  })
})
