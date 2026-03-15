// Game rules constants and pure calculation functions.
// Ported from fizbanes-forge/src/lib/GameRules.js — no React or Zustand dependencies.

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_BUDGET = 27;

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export const ABILITY_SCORE_MIN = 1;
export const ABILITY_SCORE_MAX = 20;
export const ABILITY_SCORE_ABSOLUTE_MAX = 30;

export const MAX_CHARACTER_LEVEL = 20;
export const MAX_ATTUNEMENT_SLOTS = 3;
export const CARRY_CAPACITY_MULTIPLIER = 15;
export const LIGHT_ENCUMBRANCE_MULTIPLIER = 5;
export const HEAVY_ENCUMBRANCE_MULTIPLIER = 10;

export const MAX_CHARACTER_SIZE = 10 * 1024 * 1024;
export const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024;

export const DEFAULT_ASI_LEVELS = [4, 8, 12, 16, 19] as const;

export const CLASS_ASI_LEVELS: Readonly<Record<string, readonly number[]>> = {
  Fighter: [4, 6, 8, 12, 14, 16, 19],
  Rogue: [4, 8, 10, 12, 16, 19],
};

export const PROFICIENCY_TYPES = {
  SKILLS: 'skills',
  SAVING_THROWS: 'savingThrows',
  WEAPONS: 'weapons',
  TOOLS: 'tools',
  ARMOR: 'armor',
  LANGUAGES: 'languages',
} as const;

export type ProficiencyType = (typeof PROFICIENCY_TYPES)[keyof typeof PROFICIENCY_TYPES];

/** Default hit dice face value per class (fallback when class JSON lacks hd field). */
export const DEFAULT_HIT_DICE: Readonly<Record<string, number>> = {
  Barbarian: 12,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Fighter: 10,
  Monk: 8,
  Paladin: 10,
  Ranger: 10,
  Rogue: 8,
  Sorcerer: 6,
  Warlock: 8,
  Wizard: 6,
};

/**
 * Parse a hit dice string (e.g. "1d8", "d10") into its numeric face value.
 * Returns 8 as a safe default.
 */
export function parseHitDice(hitDice: string | undefined | null): number {
  const match = hitDice?.match(/d(\d+)/);
  return match ? parseInt(match[1], 10) : 8;
}

/** Proficiency bonus by total character level (index 0 = level 1). */
const PROFICIENCY_BONUS_TABLE = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

export function getProficiencyBonus(totalLevel: number): number {
  const idx = Math.min(Math.max(totalLevel, 1), MAX_CHARACTER_LEVEL) - 1;
  return PROFICIENCY_BONUS_TABLE[idx];
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getPointBuyCost(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0;
}

export function calculatePointBuyTotal(scores: Record<string, number>): number {
  return Object.values(scores).reduce((sum, s) => sum + getPointBuyCost(s), 0);
}

/** Returns remaining point-buy budget given a set of base scores. */
export function getRemainingPointBuy(scores: Record<string, number>): number {
  return POINT_BUY_BUDGET - calculatePointBuyTotal(scores);
}

export function getCarryCapacity(strengthScore: number): number {
  return strengthScore * CARRY_CAPACITY_MULTIPLIER;
}
