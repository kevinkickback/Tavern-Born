import type { Equipment } from '@/types/character'
import { getArmorCategory } from './armorClass'
import { getNormalizedItemTraits } from './itemClassification'

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

export interface EnforcedArmorEquipment {
  equipment: Equipment[]
  unequippedIds: string[]
}

/** Unequips armor that violates proficiency or the single body-armor/shield slots. */
export function enforceArmorEquipmentRestrictions(
  equipment: Equipment[],
  armorProficiencies: string[],
): EnforcedArmorEquipment {
  let bodyArmorSlotFilled = false
  let shieldSlotFilled = false
  const unequippedIds: string[] = []

  const nextEquipment = equipment.map((item) => {
    if (!item.equipped) return item

    const armorType = getArmorCategory(item)
    if (armorType === 'none') return item

    const isShield = armorType === 'shield'
    const slotIsFilled = isShield ? shieldSlotFilled : bodyArmorSlotFilled
    const isProficient = hasArmorProficiency(armorProficiencies, armorType)

    if (!isProficient || slotIsFilled) {
      unequippedIds.push(item.id)
      return { ...item, equipped: false }
    }

    if (isShield) shieldSlotFilled = true
    else bodyArmorSlotFilled = true
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
