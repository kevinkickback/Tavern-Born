import type { Class5e } from '@/types/5etools';
import type { AbilityScores } from '@/types/character';

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

export const PROFICIENCY_TYPES = {
  SKILLS: 'skills',
  SAVING_THROWS: 'savingThrows',
  WEAPONS: 'weapons',
  TOOLS: 'tools',
  ARMOR: 'armor',
  LANGUAGES: 'languages',
} as const;

export type ProficiencyType =
  (typeof PROFICIENCY_TYPES)[keyof typeof PROFICIENCY_TYPES];

/**
 * Parse a hit dice string (e.g. "1d8", "d10") into its numeric face value.
 * Returns 8 as a safe default.
 */
export function parseHitDice(hitDice: string | undefined | null): number {
  const match = hitDice?.match(/d(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 8;
}

/** Get hit die face value from a Class5e object. Falls back to 8. */
export function getHitDiceFromClass(cls: Class5e | undefined | null): number {
  return cls?.hd?.faces ?? 8;
}

/**
 * Parse ASI levels from a Class5e classFeatures array.
 * Feature strings have format "Feature Name|ClassName|Source|Level".
 * Falls back to the standard [4,8,12,16,19] if no ASI features are found.
 */
export function getASILevelsFromClass(
  cls: Class5e | undefined | null,
): number[] {
  if (!cls?.classFeatures) return [4, 8, 12, 16, 19];
  const levels: number[] = [];
  for (const feat of cls.classFeatures) {
    if (typeof feat === 'string') {
      const parts = feat.split('|');
      if (
        parts[0]?.toLowerCase().includes('ability score improvement') &&
        parts[3]
      ) {
        const lvl = Number.parseInt(parts[3], 10);
        if (!Number.isNaN(lvl) && !levels.includes(lvl)) levels.push(lvl);
      }
    } else if (feat && typeof feat === 'object' && 'name' in feat) {
      const f = feat as { name?: string; level?: number };
      if (
        f.name?.toLowerCase().includes('ability score improvement') &&
        f.level
      ) {
        if (!levels.includes(f.level)) levels.push(f.level);
      }
    }
  }
  return levels.length > 0 ? levels.sort((a, b) => a - b) : [4, 8, 12, 16, 19];
}

const ABILITY_ABBREV_TO_FULL: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/**
 * Check whether the given ability scores meet the multiclassing requirements
 * for a class, reading the requirements directly from the Class5e data.
 */
export function checkMulticlassRequirements(
  cls: Class5e,
  abilityScores: AbilityScores,
): { meetsRequirements: boolean; requirementText: string } {
  const reqs = cls.multiclassing?.requirements;
  if (!reqs) return { meetsRequirements: true, requirementText: '' };

  const scores = abilityScores as unknown as Record<string, number>;
  const getScore = (ab: string): number => {
    const full = ABILITY_ABBREV_TO_FULL[ab.toLowerCase()] ?? ab.toLowerCase();
    return scores[full] ?? scores[ab.toLowerCase()] ?? 0;
  };
  const formatGroup = (group: Record<string, number>) =>
    Object.entries(group)
      .map(([ab, min]) => `${ab.toUpperCase()} ${min}+`)
      .join(' & ');
  const checkGroup = (group: Record<string, number>) =>
    Object.entries(group).every(([ab, min]) => getScore(ab) >= min);

  if (Array.isArray(reqs.or)) {
    return {
      meetsRequirements: reqs.or.some(checkGroup),
      requirementText: (reqs.or as Array<Record<string, number>>)
        .map(formatGroup)
        .join(' or '),
    };
  }

  const entries = Object.entries(reqs).filter(([k]) => k !== 'or') as [
    string,
    number,
  ][];
  return {
    meetsRequirements: entries.every(([ab, min]) => getScore(ab) >= min),
    requirementText: entries
      .map(([ab, min]) => `${ab.toUpperCase()} ${min}+`)
      .join(' & '),
  };
}

const PROFICIENCY_BONUS_TABLE = [
  2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
];

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

export function getRemainingPointBuy(scores: Record<string, number>): number {
  return POINT_BUY_BUDGET - calculatePointBuyTotal(scores);
}

export function getCarryCapacity(strengthScore: number): number {
  return strengthScore * CARRY_CAPACITY_MULTIPLIER;
}
