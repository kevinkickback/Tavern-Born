import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useRitualCasting } from '@/hooks/character/useRitualCasting'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetStores() {
  useCharacterStore.setState({ characters: [], activeCharacterId: null, activeCharacter: null })
  useGameDataStore.setState({ gameData: null })
}

function makeMinimalGameData(classes: unknown[]) {
  return {
    classes,
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
  }
}

function seedCharacterAndData(
  classEntries: Array<{ name: string; source: string; levels: number }>,
  classes: unknown[],
  override?: { ritualCasting?: boolean },
) {
  const character = makeCharacterFixture({
    class: classEntries[0]?.name ?? '',
    classProgression: classEntries,
    ...override,
  })

  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
  useGameDataStore.setState({ gameData: makeMinimalGameData(classes) as never })

  return character
}

describe('useRitualCasting', () => {
  beforeEach(resetStores)

  test('returns false when no active character', () => {
    useGameDataStore.setState({ gameData: makeMinimalGameData([]) as never })
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(false)
  })

  test('returns false for a non-ritual-casting class (Fighter)', () => {
    const classes = [{ name: 'Fighter', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Fighter', source: 'PHB', levels: 5 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(false)
  })

  test('returns true for Wizard (in hardcoded ritual casting set)', () => {
    const classes = [{ name: 'Wizard', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Wizard', source: 'PHB', levels: 3 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('returns true for Cleric', () => {
    const classes = [{ name: 'Cleric', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Cleric', source: 'PHB', levels: 3 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('returns true for Druid', () => {
    const classes = [{ name: 'Druid', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Druid', source: 'PHB', levels: 3 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('returns true for Bard', () => {
    const classes = [{ name: 'Bard', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Bard', source: 'PHB', levels: 3 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('returns true for multiclass character with at least one ritual-casting class', () => {
    const classes = [
      { name: 'Fighter', source: 'PHB' },
      { name: 'Wizard', source: 'PHB' },
    ]
    seedCharacterAndData(
      [
        { name: 'Fighter', source: 'PHB', levels: 5 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
      classes,
    )
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('manual override true takes precedence over class data', () => {
    // Fighter would normally return false, but the override forces true
    const classes = [{ name: 'Fighter', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Fighter', source: 'PHB', levels: 5 }], classes, {
      ritualCasting: true,
    })
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('manual override false takes precedence over class data', () => {
    // Wizard would normally return true, but the override forces false
    const classes = [{ name: 'Wizard', source: 'PHB' }]
    seedCharacterAndData([{ name: 'Wizard', source: 'PHB', levels: 5 }], classes, {
      ritualCasting: false,
    })
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(false)
  })

  test('returns true when class has ritual casting classFeatureRef', () => {
    // A custom class with a ritual casting feature reference
    const classes = [
      {
        name: 'CustomClass',
        source: 'CUSTOM',
        classFeatureRefs: [{ name: 'Ritual Casting', level: 1 }],
      },
    ]
    seedCharacterAndData([{ name: 'CustomClass', source: 'CUSTOM', levels: 1 }], classes)
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(true)
  })

  test('returns false when class data is missing from game data', () => {
    // Character has a class but it's not in game data — defaults to false
    seedCharacterAndData([{ name: 'Wizard', source: 'PHB', levels: 3 }], [])
    const { result } = renderHook(() => useRitualCasting())
    expect(result.current).toBe(false)
  })
})
