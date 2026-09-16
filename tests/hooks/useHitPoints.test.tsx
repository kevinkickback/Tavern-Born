import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => ({
    'Rogue|PHB': { name: 'Rogue', source: 'PHB', hd: { faces: 8 } },
    'Wizard|PHB': { name: 'Wizard', source: 'PHB', hd: { faces: 6 } },
  }),
}))

import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
}

describe('useHitPoints hook', () => {
  beforeEach(() => {
    resetCharacterStore()
  })

  test('calculates max HP correctly for multiclass progression', () => {
    const character = makeCharacterFixture({
      id: 'hp-hook-multi',
      classProgression: [
        { name: 'Rogue', source: 'PHB', levels: 5 },
        { name: 'Wizard', source: 'PHB', levels: 3 },
      ],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 14,
        intelligence: 14,
        wisdom: 10,
        charisma: 10,
      },
      variantRules: { averageHitPoints: true },
      hitPoints: { current: 0, temporary: 0 },
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useHitPoints())

    expect(result.current.conMod).toBe(2)
    expect(result.current.levelsHPBreakdown).toEqual([0, 10, 7, 7, 7, 7, 6, 6, 6])
    expect(result.current.calculatedMaxHP).toBe(56)
    expect(result.current.effectiveMaxHP).toBe(56)
  })

  test('applies positive and negative permanent adjustments', () => {
    const character = makeCharacterFixture({
      id: 'hp-hook-adjustments',
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 2 }],
      hitPoints: { current: 10, temporary: 0 },
      hitPointAdjustments: [
        {
          id: 'blessing',
          label: 'Blessing',
          amount: 5,
          mode: 'flat',
          sourceType: 'other',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'curse',
          label: 'Curse',
          amount: -1,
          mode: 'per-level',
          sourceType: 'other',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useHitPoints())

    expect(result.current.calculatedMaxHP).toBe(13)
    expect(result.current.adjustmentTotal).toBe(3)
    expect(result.current.effectiveMaxHP).toBe(16)
  })

  test('saves an exact override and clamps current HP to the effective maximum', () => {
    const character = makeCharacterFixture({
      id: 'hp-hook-override',
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 1 }],
      hitPoints: { current: 8, temporary: 0 },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useHitPoints())
    act(() => {
      result.current.saveHitPointSettings({
        current: 30,
        temporary: 4,
        adjustments: [],
        maxOverride: 12,
      })
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.maxHitPointsOverride).toBe(12)
    expect(updated?.hitPointsInitialized).toBe(true)
    expect(updated?.hitPoints).toEqual({ current: 12, temporary: 4 })
  })

  test('does not clamp current HP below an active typed maximum-HP effect on save', () => {
    const character = makeCharacterFixture({
      id: 'hp-hook-typed-effect',
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 1 }],
      hitPoints: { current: 11, temporary: 0 },
      manualEffects: [
        {
          id: 'typed-hp-bonus',
          label: 'Typed HP bonus',
          target: { kind: 'hit-point-maximum' },
          operation: { kind: 'add', value: 3 },
          source: { kind: 'manual', name: 'Typed HP bonus' },
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useHitPoints())
    act(() => {
      result.current.saveHitPointSettings({
        current: 11,
        temporary: 0,
        adjustments: [],
      })
    })

    expect(useCharacterStore.getState().activeCharacter?.hitPoints.current).toBe(11)
  })
})
