import type { Equipment } from '@/types/character'

/** 5etools type codes for items that are worn or held and can be toggled equipped. */
const EQUIPPABLE_TYPE_CODES = new Set([
  'LA', // light armor
  'MA', // medium armor
  'HA', // heavy armor
  'S', // shield
  'M', // melee weapon
  'R', // ranged weapon
  'WD', // wand
  'ST', // staff
  'RD', // rod
  'RG', // ring
])

/**
 * Returns true if the character's armor proficiency list covers the given armor type.
 * Uses substring matching to handle varying label formats from different source books.
 */
export function hasArmorProficiency(
  proficiencies: string[],
  armorType: 'light' | 'medium' | 'heavy' | 'shield',
): boolean {
  const keyword = armorType === 'shield' ? 'shield' : armorType
  return proficiencies.some((p) => p.toLowerCase().includes(keyword))
}

/**
 * Returns true when an item is something a character wears or holds in a
 * meaningful D&D sense and should show an Equip toggle in the UI.
 */
export function isEquippable(item: Equipment): boolean {
  const typeCode = (item.type ?? '').split('|')[0].toUpperCase()
  if (EQUIPPABLE_TYPE_CODES.has(typeCode)) return true
  if (item.armorType) return true
  if (item.weaponCategory) return true
  if (item.wondrous) return true
  if (item.tattoo) return true
  if (item.focus && item.focus.length > 0) return true
  if (item.reqAttune) return true
  return false
}
