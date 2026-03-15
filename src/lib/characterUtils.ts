// Character utility functions — pure, no React/Zustand dependencies.
// Ported from fizbanes-forge/src/app/Character.js and src/main/pdf/FieldMapping.js.

import {
  CLASS_ASI_LEVELS,
  DEFAULT_ASI_LEVELS,
  DEFAULT_HIT_DICE,
  MAX_CHARACTER_LEVEL,
  getProficiencyBonus,
  getAbilityModifier,
  parseHitDice,
} from './gameRules';
import { AbilityName, AbilityBonuses, AbilityScores } from './abilityScores';

// ── Progression types ────────────────────────────────────────────────────────

/** A single class entry within a character's multiclass progression. */
export interface ClassEntry {
  name: string;
  levels: number;
  subclass?: string;
  hitDice?: string;
}

export interface Progression {
  classes: ClassEntry[];
}

// ── Level utilities ──────────────────────────────────────────────────────────

/** Total character level summed across all class entries. */
export function getTotalLevel(progression: Progression | undefined | null): number {
  if (!progression?.classes?.length) return 1;
  return progression.classes.reduce((sum, c) => sum + (c.levels || 0), 0);
}

/** The primary (first) class entry, or null for a brand-new character. */
export function getPrimaryClass(progression: Progression | undefined | null): ClassEntry | null {
  if (!progression?.classes?.length) return null;
  return progression.classes[0];
}

/** Return the ClassEntry for a given class name, or null if not found. */
export function getClassEntry(
  progression: Progression | undefined | null,
  className: string,
): ClassEntry | null {
  return progression?.classes?.find((c) => c.name === className) ?? null;
}

export function hasClass(progression: Progression | undefined | null, className: string): boolean {
  return getClassEntry(progression, className) !== null;
}

/** Proficiency bonus derived from total level. */
export function getCharacterProficiencyBonus(
  progression: Progression | undefined | null,
): number {
  return getProficiencyBonus(getTotalLevel(progression));
}

// ── ASI / feat utilities ─────────────────────────────────────────────────────

/**
 * Count how many ASI choices are available across all classes for the levels earned.
 * Ported from Character.getFeatAvailability().
 */
export function countAvailableASIs(
  progression: Progression | undefined | null,
  race?: { name?: string } | null,
): number {
  let count = 0;
  if (progression?.classes) {
    for (const entry of progression.classes) {
      const asiLevels = CLASS_ASI_LEVELS[entry.name] ?? DEFAULT_ASI_LEVELS;
      count += asiLevels.filter((l) => l <= (entry.levels || 0)).length;
    }
  }
  // Variant Human grants 1 free feat
  const raceName = race?.name?.toLowerCase() ?? '';
  if (raceName.includes('variant') && raceName.includes('human')) {
    count += 1;
  }
  return count;
}

// ── HP utilities ─────────────────────────────────────────────────────────────

/**
 * Calculate maximum hit points for a character.
 *
 * Rules:
 * - Level 1 of primary class: max hit die + CON modifier
 * - Each subsequent level: average hit die + CON modifier  (or max if averageHp = false)
 * - Multiclass into another class: average/max of that class's hit die + CON modifier per level
 */
export function calculateMaxHP(
  progression: Progression | undefined | null,
  conModifier: number,
  options?: { averageHp?: boolean },
): number {
  const { averageHp = true } = options ?? {};
  const classes = progression?.classes ?? [];
  if (!classes.length) return 1 + conModifier;

  let total = 0;
  let firstLevel = true;

  for (const entry of classes) {
    const die = parseHitDice(entry.hitDice) || DEFAULT_HIT_DICE[entry.name] || 8;
    const avgRoll = averageHp ? Math.floor(die / 2) + 1 : die;

    for (let lvl = 1; lvl <= (entry.levels || 0); lvl++) {
      if (firstLevel) {
        total += die + conModifier;
        firstLevel = false;
      } else {
        total += Math.max(1, avgRoll + conModifier);
      }
    }
  }

  return Math.max(1, total);
}

/** Shorthand: given raw scores + bonuses compute max HP. */
export function calculateMaxHPFromScores(
  progression: Progression | undefined | null,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
  options?: { averageHp?: boolean },
): number {
  const conTotal = scores.constitution + (bonuses.constitution ?? []).reduce((s, b) => s + b.value, 0);
  const conMod = getAbilityModifier(Math.min(conTotal, 20));
  return calculateMaxHP(progression, conMod, options);
}

// ── Level validation ─────────────────────────────────────────────────────────

export function isMaxLevel(progression: Progression | undefined | null): boolean {
  return getTotalLevel(progression) >= MAX_CHARACTER_LEVEL;
}

/** Validate that a proposed multiclass is legal (total doesn't exceed 20). */
export function canGainLevel(
  progression: Progression | undefined | null,
  additionalLevels = 1,
): boolean {
  return getTotalLevel(progression) + additionalLevels <= MAX_CHARACTER_LEVEL;
}
