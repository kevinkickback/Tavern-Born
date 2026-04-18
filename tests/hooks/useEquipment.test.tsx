import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

import { useEquipment } from '@/hooks/character/useEquipment'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
}

describe('useEquipment hook', () => {
  beforeEach(() => {
    resetCharacterStore()
  })

  test('toggleEquip should sync armor class for equipped armor', () => {
    const character = makeCharacterFixture({
      id: 'equip-hook-armor',
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      equipment: [
        {
          id: 'armor-1',
          name: 'Leather Armor',
          type: 'LA',
          quantity: 1,
          equipped: false,
          ac: 11,
          armorType: 'light',
        },
      ],
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useEquipment())

    act(() => {
      result.current.toggleEquip('armor-1')
    })

    expect(computeEffectiveCharacterArmorClass(useCharacterStore.getState().activeCharacter!)).toBe(
      13,
    )
    expect(useCharacterStore.getState().activeCharacter?.equipment[0]?.equipped).toBe(true)

    act(() => {
      result.current.toggleEquip('armor-1')
    })

    expect(computeEffectiveCharacterArmorClass(useCharacterStore.getState().activeCharacter!)).toBe(
      12,
    )
    expect(useCharacterStore.getState().activeCharacter?.equipment[0]?.equipped).toBe(false)
  })

  test('toggleEquip should include shield bonus in synced armor class', () => {
    const character = makeCharacterFixture({
      id: 'equip-hook-shield',
      abilityScores: {
        strength: 10,
        dexterity: 12,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      equipment: [
        {
          id: 'armor-2',
          name: 'Chain Mail',
          type: 'HA',
          quantity: 1,
          equipped: true,
          ac: 16,
          armorType: 'heavy',
        },
        {
          id: 'shield-1',
          name: 'Shield',
          type: 'S',
          quantity: 1,
          equipped: false,
          ac: 2,
          armorType: 'shield',
        },
      ],
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useEquipment())

    act(() => {
      result.current.toggleEquip('shield-1')
    })

    expect(computeEffectiveCharacterArmorClass(useCharacterStore.getState().activeCharacter!)).toBe(
      18,
    )
  })

  test('updateCurrency should persist denomination counters', () => {
    const character = makeCharacterFixture({
      id: 'equip-hook-currency',
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useEquipment())

    act(() => {
      result.current.updateCurrency('gp', 12)
      result.current.updateCurrency('sp', 7)
    })

    expect(useCharacterStore.getState().activeCharacter?.currency).toEqual({
      cp: 0,
      sp: 7,
      ep: 0,
      gp: 12,
      pp: 0,
    })
  })
})
