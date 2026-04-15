import { describe, expect, test } from 'vitest'
import {
  computeArmorClass,
  computeEffectiveCharacterArmorClass,
  getArmorCategory,
  isArmorOrShield,
  resolveArmorType,
} from '@/lib/calculations/armorClass'
import type { Equipment } from '@/types/character'

function makeItem(overrides: Partial<Equipment>): Equipment {
  return {
    id: 'eq-1',
    name: 'Item',
    type: 'G',
    quantity: 1,
    equipped: false,
    ...overrides,
  }
}

describe('armorClass', () => {
  test('getArmorCategory prefers explicit armorType over item type code', () => {
    expect(getArmorCategory(makeItem({ type: 'HA', armorType: 'light' }))).toBe('light')
    expect(getArmorCategory(makeItem({ type: 'MA' }))).toBe('medium')
    expect(getArmorCategory(makeItem({ type: 'unknown' }))).toBe('none')
  })

  test('isArmorOrShield returns false for non-armor items', () => {
    expect(isArmorOrShield(makeItem({ type: 'G' }))).toBe(false)
    expect(isArmorOrShield(makeItem({ type: 'S' }))).toBe(true)
  })

  test('computeArmorClass uses the unarmored default and shield bonus', () => {
    const equipment = [
      makeItem({ type: 'S', equipped: true }),
      makeItem({ type: 'G', equipped: true }),
    ]

    expect(computeArmorClass(equipment, 3)).toBe(15)
  })

  test('computeArmorClass applies medium armor dex cap', () => {
    const equipment = [
      makeItem({ type: 'MA', ac: 14, equipped: true }),
      makeItem({ type: 'S', equipped: true }),
    ]

    expect(computeArmorClass(equipment, 4)).toBe(18)
  })

  test('computeArmorClass ignores dex for heavy armor and uses shield ac override', () => {
    const equipment = [
      makeItem({ type: 'HA', ac: 18, equipped: true }),
      makeItem({ type: 'S', ac: 3, equipped: true }),
    ]

    expect(computeArmorClass(equipment, 5)).toBe(21)
  })

  test('resolveArmorType maps 5etools item type codes', () => {
    expect(resolveArmorType('LA')).toBe('light')
    expect(resolveArmorType('MA')).toBe('medium')
    expect(resolveArmorType('HA')).toBe('heavy')
    expect(resolveArmorType('S')).toBe('shield')
    expect(resolveArmorType('X')).toBe('none')
  })

  test('computeEffectiveCharacterArmorClass prefers override when present', () => {
    const effective = computeEffectiveCharacterArmorClass({
      armorClassOverride: 19,
      abilityScores: { dexterity: 18 },
      equipment: [makeItem({ type: 'LA', ac: 11, equipped: true })],
    })

    expect(effective).toBe(19)
  })

  test('computeEffectiveCharacterArmorClass derives from equipment when no override exists', () => {
    const effective = computeEffectiveCharacterArmorClass({
      abilityScores: { dexterity: 14 },
      equipment: [
        makeItem({ type: 'LA', ac: 11, equipped: true }),
        makeItem({ type: 'S', equipped: true }),
      ],
    })

    expect(effective).toBe(15)
  })
})
