import type { Equipment } from '@/types/character';

export type ArmorCategory = 'light' | 'medium' | 'heavy' | 'shield' | 'none';

const ARMOR_TYPE_MAP: Record<string, ArmorCategory> = {
  LA: 'light',
  MA: 'medium',
  HA: 'heavy',
  S: 'shield',
};

/** Returns the armour category derived from a 5etools item type code. */
export function getArmorCategory(item: Equipment): ArmorCategory {
  // An explicit armorType wins (set when importing from game data)
  if (item.armorType) return item.armorType;
  return ARMOR_TYPE_MAP[item.type?.toUpperCase() ?? ''] ?? 'none';
}

export function isArmorOrShield(item: Equipment): boolean {
  return getArmorCategory(item) !== 'none';
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
export function computeArmorClass(
  equipment: Equipment[],
  dexModifier: number,
): number {
  const equipped = equipment.filter((e) => e.equipped);

  const bodyArmor = equipped.find((e) => {
    const cat = getArmorCategory(e);
    return cat === 'light' || cat === 'medium' || cat === 'heavy';
  });
  const shield = equipped.find((e) => getArmorCategory(e) === 'shield');
  const shieldBonus = shield ? (shield.ac ?? 2) : 0;

  if (!bodyArmor) {
    return 10 + dexModifier + shieldBonus;
  }

  const baseAC = bodyArmor.ac ?? 10;
  const category = getArmorCategory(bodyArmor);

  let ac: number;
  if (category === 'light') {
    ac = baseAC + dexModifier;
  } else if (category === 'medium') {
    ac = baseAC + Math.min(dexModifier, 2);
  } else {
    // heavy — no DEX bonus
    ac = baseAC;
  }

  return ac + shieldBonus;
}

/**
 * Convert a 5etools `Item5e`-shaped object into the `armorType` enum value
 * to store on an `Equipment` record at import time.
 */
export function resolveArmorType(item5eType: string): ArmorCategory {
  return ARMOR_TYPE_MAP[item5eType?.toUpperCase() ?? ''] ?? 'none';
}
