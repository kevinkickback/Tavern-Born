import { describe, expect, test } from 'vitest'
import {
  buildItemDetailFields,
  getInventoryItemClassification,
  getInventoryItemTypeLabel,
  getItemCategory,
  itemMatchesFilter,
} from '@/pages/equipment/itemDetailFields'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'

function makeItem(patch: Partial<Equipment> = {}): Equipment {
  return {
    id: 'item',
    name: 'Test Item',
    type: 'G',
    quantity: 1,
    equipped: false,
    ...patch,
  }
}

function labels(item: Equipment, itemData?: Item5e): string[] {
  return buildItemDetailFields(item, itemData, { F: 'Finesse', V: 'Versatile' }).map(
    (field) => field.label,
  )
}

describe('equipment item detail fields', () => {
  test('keeps ordinary gear compact and omits irrelevant combat placeholders', () => {
    const fields = buildItemDetailFields(
      makeItem({ weight: 2, value: 125, properties: ['F'] }),
      undefined,
      { F: 'Finesse' },
    )

    expect(fields).toEqual([
      { label: 'Quantity', value: 1 },
      { label: 'Weight', value: '2 lb each' },
      { label: 'Value', value: '1 gp 25 cp' },
      { label: 'Properties', value: 'Finesse' },
    ])
    expect(labels(makeItem())).not.toEqual(
      expect.arrayContaining(['Armor Class', 'Damage', 'Range']),
    )
  })

  test('shows populated weapon statistics', () => {
    const item = makeItem({
      type: 'M',
      weaponCategory: 'martial',
      dmg1: '1d8',
      dmg2: '1d10',
      dmgType: 'slashing',
      range: '5 ft.',
      properties: ['V'],
    })

    expect(buildItemDetailFields(item, undefined, { V: 'Versatile' })).toEqual([
      { label: 'Quantity', value: 1 },
      { label: 'Damage', value: '1d8 Slashing (1d10 versatile)' },
      { label: 'Range', value: '5 ft.' },
      { label: 'Properties', value: 'Versatile' },
    ])
  })

  test('enriches armor details from canonical item data', () => {
    const item = makeItem({ type: 'HA', armorType: 'heavy', ac: 18 })
    const itemData: Item5e = {
      name: 'Plate',
      source: 'PHB',
      type: 'HA',
      strength: '15',
      stealth: true,
    }

    expect(buildItemDetailFields(item, itemData, {})).toEqual([
      { label: 'Quantity', value: 1 },
      { label: 'Armor Type', value: 'Heavy Armor' },
      { label: 'Armor Class', value: 18 },
      { label: 'Strength', value: '15 required' },
      { label: 'Stealth', value: 'Disadvantage' },
    ])
  })

  test('omits combat fields for consumables while preserving exceptional populated data', () => {
    const potion = makeItem({ type: 'P', quantity: 2 })
    const unusualGear = makeItem({ ac: 1 })

    expect(labels(potion)).toEqual(['Quantity'])
    expect(labels(unusualGear)).toEqual(['Quantity', 'Armor Class'])
  })

  test('uses the same category model for labels and filters', () => {
    const tool = makeItem({ type: 'AT' })

    expect(getItemCategory(tool)).toBe('Gear')
    expect(itemMatchesFilter(tool, 'Gear')).toBe(true)
    expect(itemMatchesFilter(tool, 'Weapons')).toBe(false)
  })

  test('labels armor by subtype while keeping shields in the Armor filter', () => {
    const lightArmor = makeItem({ type: 'LA', armorType: 'light' })
    const shield = makeItem({ type: 'S', armorType: 'shield' })

    expect(getInventoryItemTypeLabel(lightArmor)).toBe('Light Armor')
    expect(getInventoryItemTypeLabel(shield)).toBe('Shields')
    expect(getInventoryItemClassification(shield)).toEqual({
      category: 'Armor',
      label: 'Shields',
    })
    expect(itemMatchesFilter(lightArmor, 'Armor')).toBe(true)
    expect(itemMatchesFilter(shield, 'Armor')).toBe(true)
  })
})
