import type { Equipment } from '@/types/character'
import { getAbilityModifier } from './gameRules'

export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield' | 'none'

/** Maps 5etools item type codes to internal armor categories. */
export const ARMOR_TYPE_MAP: Readonly<Record<string, ArmorCategory>> = {
  LA: 'light',
  MA: 'medium',
  HA: 'heavy',
  S: 'shield',
}

/**
 * Reverse map: armor category display names (as used in 5etools filter strings)
 * to their corresponding item type code.  Kept alongside ARMOR_TYPE_MAP so both
 * stay in sync from a single source.
 */
export const ARMOR_CATEGORY_LABEL_TO_CODE: Readonly<Record<string, string>> = {
  'light armor': 'LA',
  'medium armor': 'MA',
  'heavy armor': 'HA',
  shield: 'S',
}

/** Returns the armour category derived from a 5etools item type code. */
export function getArmorCategory(item: Equipment): ArmorCategory {
  // An explicit armorType wins (set when importing from game data)
  if (item.armorType) return item.armorType
  const typeKey = item.type?.toUpperCase() ?? ''
  if (typeKey === 'SHIELD') return 'shield'
  return ARMOR_TYPE_MAP[typeKey] ?? 'none'
}

export function isArmorOrShield(item: Equipment): boolean {
  return getArmorCategory(item) !== 'none'
}

/**
 * Calculate Armour Class from equipped items and the character's DEX modifier.
 *
 * Rules (PHB):
 * - No armour:   10 + DEX
 * - Light:       base AC + DEX
 * - Medium:      base AC + min(DEX, 2)
 * - Heavy:       base AC (no DEX)
 * - Shield:      +2 (stacks with anything)
 *
 * If multiple armour pieces are equipped, the first one found is used (no stack).
 * If no `ac` field is present on an armour item, we treat it as 10.
 */
export function computeArmorClass(equipment: Equipment[], dexModifier: number): number {
  const equipped = equipment.filter((e) => e.equipped)

  const bodyArmor = equipped.find((e) => {
    const cat = getArmorCategory(e)
    return cat === 'light' || cat === 'medium' || cat === 'heavy'
  })
  const shield = equipped.find((e) => getArmorCategory(e) === 'shield')
  const shieldBonus = shield ? (shield.ac ?? 2) : 0

  if (!bodyArmor) {
    return 10 + dexModifier + shieldBonus
  }

  const baseAC = bodyArmor.ac ?? 10
  const category = getArmorCategory(bodyArmor)

  let ac: number
  if (category === 'light') {
    ac = baseAC + dexModifier
  } else if (category === 'medium') {
    ac = baseAC + Math.min(dexModifier, 2)
  } else {
    // heavy — no DEX bonus
    ac = baseAC
  }

  return ac + shieldBonus
}

/**
 * Convert a 5etools `Item5e`-shaped object into the `armorType` enum value
 * to store on an `Equipment` record at import time.
 */
export function resolveArmorType(item5eType: string): ArmorCategory {
  return ARMOR_TYPE_MAP[item5eType?.toUpperCase() ?? ''] ?? 'none'
}

/**
 * Backward-compatible AC calculator used by integration tests and legacy callers.
 *
 * `mode` is retained for compatibility and currently ignored.
 */
export function calculateAC(
  character: {
    equipment?: Equipment[]
    abilityScores?: { dexterity?: number; dex?: number }
  },
  _mode?: 'base' | 'stored' | string,
): number {
  const dexScore = character.abilityScores?.dexterity ?? character.abilityScores?.dex ?? 10
  const dexModifier = getAbilityModifier(dexScore)
  return computeArmorClass(character.equipment ?? [], dexModifier)
}

/**
 * Canonical AC read for character consumers.
 *
 * Uses explicit override when present, otherwise derives AC from equipped items.
 */
export function computeEffectiveCharacterArmorClass(character: {
  equipment?: Equipment[]
  abilityScores?: { dexterity?: number; dex?: number }
  armorClass?: number
  armorClassOverride?: number
}): number {
  if (typeof character.armorClassOverride === 'number') {
    return Math.max(0, Math.trunc(character.armorClassOverride))
  }

  if (typeof character.armorClass === 'number') {
    return Math.max(0, Math.trunc(character.armorClass))
  }

  const dexScore = character.abilityScores?.dexterity ?? character.abilityScores?.dex ?? 10
  const dexModifier = getAbilityModifier(dexScore)
  return computeArmorClass(character.equipment ?? [], dexModifier)
}
