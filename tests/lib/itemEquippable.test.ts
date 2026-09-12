import { describe, expect, test } from 'vitest'
import { enforceArmorEquipmentRestrictions } from '@/lib/calculations/itemEquippable'
import type { Equipment } from '@/types/character'

function armor(
  id: string,
  armorType: Equipment['armorType'],
  overrides: Partial<Equipment> = {},
): Equipment {
  return {
    id,
    name: id,
    type: armorType === 'shield' ? 'S' : `${armorType?.charAt(0).toUpperCase()}A`,
    armorType,
    quantity: 1,
    equipped: true,
    ...overrides,
  }
}

describe('enforceArmorEquipmentRestrictions', () => {
  test('unequips nonproficient and duplicate armor while retaining other equipped gear', () => {
    const equipment = [
      armor('heavy', 'heavy'),
      armor('light-first', 'light'),
      armor('light-second', 'light'),
      armor('shield-first', 'shield'),
      armor('shield-second', 'shield'),
      armor('legacy-medium', undefined, { type: 'MA|XPHB' }),
      armor('sword', undefined, { type: 'M', weaponCategory: 'martial' }),
    ]

    const result = enforceArmorEquipmentRestrictions(equipment, ['light armor', 'shields'])

    expect(result.unequippedIds).toEqual([
      'heavy',
      'light-second',
      'shield-second',
      'legacy-medium',
    ])
    expect(result.equipment.filter((item) => item.equipped).map((item) => item.id)).toEqual([
      'light-first',
      'shield-first',
      'sword',
    ])
  })

  test('keeps original objects when every equipped item remains valid', () => {
    const equipment = [armor('light', 'light'), armor('shield', 'shield')]
    const result = enforceArmorEquipmentRestrictions(equipment, ['light', 'shield'])

    expect(result.unequippedIds).toEqual([])
    expect(result.equipment[0]).toBe(equipment[0])
    expect(result.equipment[1]).toBe(equipment[1])
  })
})
