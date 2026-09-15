import type { ArmorClassAdjustment, Character, Equipment } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getCharacterEffectResolutionContext, getCharacterEffects } from './characterEffects'
import { resolveNumericEffect } from './effects'
import { getAbilityModifier } from './gameRules'
import {
  type ArmorCategory,
  getNormalizedItemTraits,
  validateItemTypeFallbacks,
} from './itemClassification'

export { ARMOR_CATEGORY_LABEL_TO_CODE } from './itemClassification'
export type { ArmorCategory }

/**
 * Validate that ARMOR_TYPE_MAP codes are present in the parsed itemTypeByAbbr lookup.
 * Call once after game data loads in DEV mode. Logs warnings for any missing codes so
 * they surface if 5etools ever renames or removes a type abbreviation.
 */
export function validateArmorTypeCodes(itemTypeByAbbr: Record<string, string>): void {
  validateItemTypeFallbacks(itemTypeByAbbr)
}

export function getArmorCategory(item: Equipment): ArmorCategory {
  return getNormalizedItemTraits(item).armorCategory
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
    ac = baseAC
  }

  return ac + shieldBonus
}

/**
 * Convert a 5etools `Item5e`-shaped object into the `armorType` enum value
 * to store on an `Equipment` record at import time.
 */
export function resolveArmorType(item5eType: string): ArmorCategory {
  return getNormalizedItemTraits({ type: item5eType }).armorCategory
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

export function calculateArmorClassAdjustmentTotal(
  adjustments: readonly ArmorClassAdjustment[] | undefined,
): number {
  return (adjustments ?? []).reduce((total, adjustment) => total + adjustment.amount, 0)
}

/**
 * Canonical AC read for character consumers.
 *
 * Uses an explicit override when present. Otherwise, derives AC live from equipped
 * items and ability scores, then applies lasting adjustments. The stored
 * `character.armorClass` field is intentionally
 * ignored — it exists only for migration compatibility and is never written to.
 */
export function computeEffectiveCharacterArmorClass(
  character: Partial<
    Pick<
      Character,
      | 'armorClass'
      | 'armorClassAdjustments'
      | 'armorClassOverride'
      | 'effectFlags'
      | 'equipment'
      | 'manualEffects'
      | 'suppressedEffectIds'
    >
  > & { abilityScores?: { dexterity?: number; dex?: number } },
  effectiveAbilityScores: { dexterity?: number; dex?: number } | undefined,
  sourceEffects: readonly CharacterEffect[] = [],
): number {
  const dexScore = effectiveAbilityScores?.dexterity ?? effectiveAbilityScores?.dex ?? 10
  const dexModifier = getAbilityModifier(dexScore)
  const resolved = resolveNumericEffect(
    computeArmorClass(character.equipment ?? [], dexModifier),
    { kind: 'armor-class' },
    getCharacterEffects(character, 1, sourceEffects),
    getCharacterEffectResolutionContext(character),
  )
  return Math.max(0, Math.trunc(resolved.value))
}
