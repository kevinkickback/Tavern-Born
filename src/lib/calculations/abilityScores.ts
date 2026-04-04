// Ability score utility functions — pure, no React/Zustand dependencies.
// Ported from fizbanes-forge/src/lib/AbilityScoreUtils.js and AbilityScoreService.js.

import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  ABILITY_SCORE_MAX,
  getAbilityModifier,
  getPointBuyCost,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from './gameRules';

export type AbilityName = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

export const ABILITY_NAMES: readonly AbilityName[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

export const ABILITY_ABBREVIATIONS: Readonly<Record<AbilityName, string>> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

export type AbilityScores = Record<AbilityName, number>;

/** A bonus applied to an ability from a named source (race, feat, ASI, etc.). */
export interface AbilityBonus {
  value: number;
  source: string;
}

export type AbilityBonuses = Record<AbilityName, AbilityBonus[]>;

export function makeDefaultAbilityScores(base = 8): AbilityScores {
  return {
    strength: base,
    dexterity: base,
    constitution: base,
    intelligence: base,
    wisdom: base,
    charisma: base,
  };
}

export function makeEmptyAbilityBonuses(): AbilityBonuses {
  return {
    strength: [],
    dexterity: [],
    constitution: [],
    intelligence: [],
    wisdom: [],
    charisma: [],
  };
}

/**
 * Compute the total ability score: base + all stacked bonuses.
 * Capped at ABILITY_SCORE_ABSOLUTE_MAX (30).
 */
export function getTotalAbilityScore(
  base: number,
  bonuses: AbilityBonus[],
): number {
  const total = base + bonuses.reduce((sum, b) => sum + b.value, 0);
  return Math.min(total, ABILITY_SCORE_ABSOLUTE_MAX);
}

/** Compute the total score for a named ability, capped at 20 for most calculations. */
export function getAbilityScore(
  ability: AbilityName,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): number {
  return Math.min(
    getTotalAbilityScore(scores[ability], bonuses[ability] ?? []),
    ABILITY_SCORE_MAX,
  );
}

export function getAbilityModifierForCharacter(
  ability: AbilityName,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): number {
  return getAbilityModifier(getAbilityScore(ability, scores, bonuses));
}

/** All ability modifiers for a character's scores + bonuses. */
export function getAllAbilityModifiers(
  scores: AbilityScores,
  bonuses: AbilityBonuses,
): Record<AbilityName, number> {
  return Object.fromEntries(
    ABILITY_NAMES.map((a) => [a, getAbilityModifierForCharacter(a, scores, bonuses)]),
  ) as Record<AbilityName, number>;
}

/** Total point-buy cost for a set of base scores. */
export function calculatePointBuyTotal(scores: Partial<AbilityScores>): number {
  return Object.values(scores).reduce((sum: number, s) => sum + getPointBuyCost(s as number), 0);
}

export function getRemainingPointBuy(scores: Partial<AbilityScores>, budget: number): number {
  return budget - calculatePointBuyTotal(scores);
}

/** Returns all valid point-buy scores in ascending order. */
export function getValidPointBuyScores(): number[] {
  return Object.keys(POINT_BUY_COSTS)
    .map(Number)
    .sort((a, b) => a - b);
}

export function isValidPointBuyScore(score: number): boolean {
  return score >= POINT_BUY_MIN && score <= POINT_BUY_MAX;
}

/**
 * Check if scores form a valid standard array assignment.
 * Valid assignment: each value from STANDARD_ARRAY appears at most once across abilities.
 */
export function isValidStandardArrayAssignment(scores: Partial<AbilityScores>): boolean {
  const values = Object.values(scores).filter(v => v !== undefined) as number[];
  const usedCounts = new Map<number, number>();
  
  for (const val of values) {
    usedCounts.set(val, (usedCounts.get(val) ?? 0) + 1);
  }
  
  // Each value can be used at most once, and must be in STANDARD_ARRAY
  for (const [val, count] of usedCounts) {
    if (count > 1 || !STANDARD_ARRAY.includes(val as any)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Format a modifier as a signed string: "+2", "-1", "+0".
 */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ── Racial ability data helpers ─────────────────────────────────────────────

/** A fixed racial ability bonus. */
export interface FixedAbilityBonus {
  ability: AbilityName;
  value: number;
  source: 'race' | 'subrace';
}

/** A choosable racial ability bonus (Tasha's or "choose any"). */
export interface ChoosableAbilityBonus {
  count: number;
  amount: number;
  from: AbilityName[];
  source: 'race' | 'subrace';
}

export interface RaceAbilityData {
  fixed: FixedAbilityBonus[];
  choices: ChoosableAbilityBonus[];
}

type RaceAbilityEntry = Partial<Record<string, number>> & {
  choose?: {
    count?: number;
    amount?: number;
    from?: string[];
  };
};

/** Normalize an ability abbreviation (e.g. "str", "STR") to a full lowercase name. */
export function normalizeAbilityName(input: string): AbilityName | null {
  const map: Record<string, AbilityName> = {
    str: 'strength', strength: 'strength',
    dex: 'dexterity', dexterity: 'dexterity',
    con: 'constitution', constitution: 'constitution',
    int: 'intelligence', intelligence: 'intelligence',
    wis: 'wisdom', wisdom: 'wisdom',
    cha: 'charisma', charisma: 'charisma',
  };
  return map[input.toLowerCase().trim()] ?? null;
}

/**
 * Extract fixed bonuses and choosable bonuses from 5etools race/subrace ability arrays.
 * Ported from AbilityScoreUtils.getRaceAbilityData().
 */
export function getRaceAbilityData(
  race?: { ability?: RaceAbilityEntry[] } | null,
  subrace?: { ability?: RaceAbilityEntry[] } | null,
): RaceAbilityData {
  const fixed: FixedAbilityBonus[] = [];
  const choices: ChoosableAbilityBonus[] = [];

  function processEntries(
    entries: RaceAbilityEntry[] | undefined,
    source: 'race' | 'subrace',
  ) {
    if (!entries) return;
    for (const entry of entries) {
      if (entry.choose) {
        choices.push({
          count: entry.choose.count ?? 1,
          amount: entry.choose.amount ?? 1,
          from: (entry.choose.from ?? Object.keys(ABILITY_ABBREVIATIONS)).map(
            (a) => normalizeAbilityName(a),
          ).filter((a): a is AbilityName => a !== null),
          source,
        });
      } else {
        for (const [key, val] of Object.entries(entry)) {
          const ability = normalizeAbilityName(key);
          if (ability && typeof val === 'number') {
            fixed.push({ ability, value: val, source });
          }
        }
      }
    }
  }

  processEntries(race?.ability, 'race');
  processEntries(subrace?.ability, 'subrace');

  return { fixed, choices };
}
