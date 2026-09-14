import { describe, expect, test, vi } from 'vitest'
import {
  ITEM_TYPE_CATALOG_FALLBACKS,
  LEGACY_ITEM_TYPE_FALLBACKS,
} from '@/lib/5etools/rulesetMetadata'
import {
  getNormalizedItemTraits,
  inferArmorCategory,
  validateItemTypeFallbacks,
} from '@/lib/calculations/itemClassification'

const TYPES = {
  LA: 'Light Armor',
  MA: 'Medium Armor',
  HA: 'Heavy Armor',
  S: 'Shield',
  M: 'Melee Weapon',
  R: 'Ranged Weapon',
  AT: "Artisan's Tools",
  P: 'Potion',
  SC: 'Scroll',
}

describe('item classification', () => {
  test.each([
    ['LA', 'light'],
    ['MA', 'medium'],
    ['HA', 'heavy'],
    ['S', 'shield'],
  ] as const)('derives %s armor from parsed item type labels', (type, category) => {
    expect(getNormalizedItemTraits({ type }, TYPES).armorCategory).toBe(category)
  })

  test('uses parsed labels before versioned code fallbacks', () => {
    expect(getNormalizedItemTraits({ type: 'LA' }, { LA: 'Medium Armor' }).armorCategory).toBe(
      'medium',
    )
  })

  test('provides one taxonomy for weapons, tools, and consumables', () => {
    expect(getNormalizedItemTraits({ type: 'M' }, TYPES).isWeapon).toBe(true)
    expect(getNormalizedItemTraits({ type: 'AT' }, TYPES).isTool).toBe(true)
    expect(getNormalizedItemTraits({ type: 'P' }, TYPES).isConsumable).toBe(true)
    expect(getNormalizedItemTraits({ type: 'SC' }, TYPES).isConsumable).toBe(true)
  })

  test('normalizes category labels used by proficiency grants', () => {
    expect(inferArmorCategory('Medium Armor')).toBe('medium')
    expect(inferArmorCategory('Shields')).toBe('shield')
  })

  test('retains legacy item codes without treating them as current catalog entries', () => {
    expect(Object.keys(ITEM_TYPE_CATALOG_FALLBACKS)).not.toContain('SHIELD')
    expect(Object.keys(ITEM_TYPE_CATALOG_FALLBACKS)).not.toContain('ST')
    expect(Object.keys(LEGACY_ITEM_TYPE_FALLBACKS)).toEqual(['SHIELD', 'ST'])
    expect(getNormalizedItemTraits({ type: 'SHIELD' }).armorCategory).toBe('shield')
    expect(getNormalizedItemTraits({ type: 'ST' }).isEquippable).toBe(true)
  })

  test('does not warn about compatibility-only aliases during catalog validation', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    validateItemTypeFallbacks({})

    const messages = warning.mock.calls.map(([message]) => String(message))
    expect(messages.some((message) => message.includes('"SHIELD"'))).toBe(false)
    expect(messages.some((message) => message.includes('"ST"'))).toBe(false)
    expect(messages.some((message) => message.includes('"LA"'))).toBe(true)
    warning.mockRestore()
  })
})
