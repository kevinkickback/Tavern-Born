import { resolveItemReference } from '@/lib/5etools/itemResolvers'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import { getArmorCategory } from './armorClass'
import { getNormalizedItemTraits } from './itemClassification'

/**
 * Returns true if the character's armor proficiency list covers the given armor type.
 * Uses substring matching to handle varying label formats from different source books.
 */
function hasArmorProficiency(
  proficiencies: string[],
  armorType: 'light' | 'medium' | 'heavy' | 'shield',
): boolean {
  const keyword = armorType === 'shield' ? 'shield' : armorType
  return proficiencies.some((p) => p.toLowerCase().includes(keyword))
}

export interface EnforcedArmorEquipment {
  equipment: Equipment[]
  unequippedIds: string[]
}

export type ArmorEquipRestriction =
  | { kind: 'slot-conflict'; conflictingItem: Equipment }
  | { kind: 'missing-proficiency'; armorType: 'light' | 'medium' | 'heavy' | 'shield' }

/** Check the same armor slots and proficiency policy used when restrictions are re-enabled. */
export function getArmorEquipRestriction(
  item: Equipment,
  equippedItems: readonly Equipment[],
  armorProficiencies: string[],
  catalog?: ReadonlyMap<string, Item5e>,
): ArmorEquipRestriction | null {
  const armorType = getArmorCategory(item)
  if (armorType === 'none') return null

  const conflictingItem = equippedItems.find((other) => {
    if (other.id === item.id || !other.equipped) return false
    const otherArmorType = getArmorCategory(other)
    return armorType === 'shield'
      ? otherArmorType === 'shield'
      : otherArmorType !== 'none' && otherArmorType !== 'shield'
  })
  if (conflictingItem) return { kind: 'slot-conflict', conflictingItem }
  if (!hasArmorProficiency(armorProficiencies, armorType)) {
    const data = resolveItemReference(item, catalog)
    if (data?.grantsProficiency === true && !data.magicVariantReference) return null
    return { kind: 'missing-proficiency', armorType }
  }
  return null
}

/** Unequips armor that violates proficiency or the single body-armor/shield slots. */
export function enforceArmorEquipmentRestrictions(
  equipment: Equipment[],
  armorProficiencies: string[],
  catalog?: ReadonlyMap<string, Item5e>,
): EnforcedArmorEquipment {
  const retainedEquipped: Equipment[] = []
  const unequippedIds: string[] = []

  const nextEquipment = equipment.map((item) => {
    if (!item.equipped) return item
    if (getArmorEquipRestriction(item, retainedEquipped, armorProficiencies, catalog)) {
      unequippedIds.push(item.id)
      return { ...item, equipped: false }
    }
    if (getArmorCategory(item) !== 'none') retainedEquipped.push(item)
    return item
  })

  return { equipment: nextEquipment, unequippedIds }
}

/**
 * Returns true when an item is something a character wears or holds in a
 * meaningful D&D sense and should show an Equip toggle in the UI.
 */
export function isEquippable(item: Equipment): boolean {
  return getNormalizedItemTraits(item).isEquippable
}
