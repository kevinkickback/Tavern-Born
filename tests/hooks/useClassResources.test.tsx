import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useClassResources } from '@/hooks/character/useClassResources'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetStores() {
  useCharacterStore.setState({ characters: [], activeCharacterId: null, activeCharacter: null })
  useGameDataStore.setState({ gameData: null })
}

/** Fighter class data with hardcoded resources (Second Wind, Action Surge at lv2+) */
const FIGHTER_CLASS_DATA = {
  name: 'Fighter',
  source: 'PHB',
  classTableGroups: [],
  startingProficiencies: {},
}

function seedFighterCharacter(level: number, classResources?: Record<string, number>) {
  const character = makeCharacterFixture({
    class: 'Fighter',
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: level }],
    classResources,
  })

  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
  useGameDataStore.setState({
    gameData: {
      classes: [FIGHTER_CLASS_DATA as never],
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
      organizations: [],
      sources: [],
    },
  })

  return character
}

describe('useClassResources', () => {
  beforeEach(resetStores)

  test('returns empty resources when no active character', () => {
    const { result } = renderHook(() => useClassResources())
    expect(result.current.resources).toEqual([])
  })

  test('returns Fighter resources at level 1 (Second Wind only)', () => {
    seedFighterCharacter(1)
    const { result } = renderHook(() => useClassResources())

    // At level 1, Fighter has Second Wind (max 1); Action Surge is 0 so filtered out
    const secondWind = result.current.resources.find((r) => r.id === 'fighter-second-wind')
    expect(secondWind).toBeDefined()
    expect(secondWind?.max).toBe(1)
    expect(secondWind?.className).toBe('Fighter')

    // Action Surge is 0 at level 1, should not appear
    const actionSurge = result.current.resources.find((r) => r.id === 'fighter-action-surge')
    expect(actionSurge).toBeUndefined()
  })

  test('returns Action Surge at level 2', () => {
    seedFighterCharacter(2)
    const { result } = renderHook(() => useClassResources())

    const actionSurge = result.current.resources.find((r) => r.id === 'fighter-action-surge')
    expect(actionSurge).toBeDefined()
    expect(actionSurge?.max).toBe(1)
    expect(actionSurge?.restType).toBe('short')
  })

  test('uses stored current value from character.classResources', () => {
    seedFighterCharacter(1, { 'fighter-second-wind': 0 })
    const { result } = renderHook(() => useClassResources())

    const secondWind = result.current.resources.find((r) => r.id === 'fighter-second-wind')
    expect(secondWind?.current).toBe(0)
  })

  test('defaults current to max when no stored value', () => {
    seedFighterCharacter(1)
    const { result } = renderHook(() => useClassResources())

    const secondWind = result.current.resources.find((r) => r.id === 'fighter-second-wind')
    expect(secondWind?.current).toBe(secondWind?.max)
  })

  test('updateCurrent clamps value to [0, max]', () => {
    seedFighterCharacter(1)
    const { result } = renderHook(() => useClassResources())

    act(() => {
      result.current.updateCurrent('fighter-second-wind', 999)
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.classResources?.['fighter-second-wind']).toBe(1) // clamped to max
  })

  test('updateCurrent clamps negative values to 0', () => {
    seedFighterCharacter(1)
    const { result } = renderHook(() => useClassResources())

    act(() => {
      result.current.updateCurrent('fighter-second-wind', -5)
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.classResources?.['fighter-second-wind']).toBe(0)
  })

  test('updateCurrent is a no-op for unknown resource id', () => {
    seedFighterCharacter(1)
    const { result } = renderHook(() => useClassResources())

    const before = useCharacterStore.getState().activeCharacter?.classResources
    act(() => {
      result.current.updateCurrent('nonexistent-resource', 1)
    })
    const after = useCharacterStore.getState().activeCharacter?.classResources

    expect(after).toEqual(before)
  })

  test('resetResource restores resource to its max', () => {
    seedFighterCharacter(1, { 'fighter-second-wind': 0 })
    const { result } = renderHook(() => useClassResources())

    act(() => {
      result.current.resetResource('fighter-second-wind')
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.classResources?.['fighter-second-wind']).toBe(1)
  })

  test('resetAll restores all resources to their max', () => {
    seedFighterCharacter(2, {
      'fighter-second-wind': 0,
      'fighter-action-surge': 0,
    })
    const { result } = renderHook(() => useClassResources())

    act(() => {
      result.current.resetAll()
    })

    const { activeCharacter } = useCharacterStore.getState()
    expect(activeCharacter?.classResources?.['fighter-second-wind']).toBe(1)
    expect(activeCharacter?.classResources?.['fighter-action-surge']).toBe(1)
  })
})
