import type { Class5e } from '@/types/5etools'
import type { AbilityBonuses, AbilityScores } from './calculations/abilityScores'
import {
  getAbilityModifier,
  getASILevelsFromClass,
  getHitDiceFromClass,
  getProficiencyBonus,
  MAX_CHARACTER_LEVEL,
  parseHitDice,
} from './calculations/gameRules'

/** A single class entry within a character's multiclass progression. */
export interface ClassEntry {
  name: string
  source?: string
  levels: number
  subclass?: string
  hitDice?: string
}

export interface Progression {
  classes: ClassEntry[]
}

/** Total character level summed across all class entries. */
export function getTotalLevel(progression: Progression | undefined | null): number {
  if (!progression?.classes?.length) return 1
  return progression.classes.reduce((sum, c) => sum + (c.levels || 0), 0)
}

/** The primary (first) class entry, or null for a brand-new character. */
export function getPrimaryClass(progression: Progression | undefined | null): ClassEntry | null {
  if (!progression?.classes?.length) return null
  return progression.classes[0]
}

export function getClassEntry(
  progression: Progression | undefined | null,
  className: string,
): ClassEntry | null {
  return progression?.classes?.find((c) => c.name === className) ?? null
}

export function hasClass(progression: Progression | undefined | null, className: string): boolean {
  return getClassEntry(progression, className) !== null
}

export function getCharacterProficiencyBonus(progression: Progression | undefined | null): number {
  return getProficiencyBonus(getTotalLevel(progression))
}

/**
 * Count how many ASI choices are available across all classes for the levels earned.
 * Pass `classesData` (from the game data store) for accurate per-class ASI counts;
 * without it, the standard PHB schedule [4,8,12,16,19] is used as a fallback.
 */
export function countAvailableASIs(
  progression: Progression | undefined | null,
  race?: { name?: string } | null,
  classesData?: Class5e[],
): number {
  let count = 0
  if (progression?.classes) {
    for (const entry of progression.classes) {
      const cls = classesData?.find((c) => c.name === entry.name)
      const asiLevels = getASILevelsFromClass(cls)
      count += asiLevels.filter((l) => l <= (entry.levels || 0)).length
    }
  }
  // Variant Human grants 1 free feat
  const raceName = race?.name?.toLowerCase() ?? ''
  if (raceName.includes('variant') && raceName.includes('human')) {
    count += 1
  }
  return count
}

/**
 * Calculate maximum hit points for a character.
 *
 * Rules:
 * - Level 1 of primary class: max hit die + CON modifier
 * - Each subsequent level: average hit die + CON modifier  (or max if averageHp = false)
 * - Multiclass into another class: average/max of that class's hit die + CON modifier per level
 *
 * Pass `classesData` (from the game data store) for accurate per-class hit dice;
 * without it, falls back to `entry.hitDice` string or 8.
 */
export function calculateMaxHP(
  progression: Progression | undefined | null,
  conModifier: number,
  options?: { averageHp?: boolean; classesData?: Class5e[] },
): number {
  const { averageHp = true, classesData } = options ?? {}
  const classes = progression?.classes ?? []
  if (!classes.length) return 1 + conModifier

  let total = 0
  let firstLevel = true

  for (const entry of classes) {
    const cls = classesData?.find((c) => c.name === entry.name)
    const entryDie = entry.hitDice ? parseHitDice(entry.hitDice) : null
    const die = entryDie ?? getHitDiceFromClass(cls)
    const avgRoll = averageHp ? Math.floor(die / 2) + 1 : die

    for (let lvl = 1; lvl <= (entry.levels || 0); lvl++) {
      if (firstLevel) {
        total += die + conModifier
        firstLevel = false
      } else {
        total += Math.max(1, avgRoll + conModifier)
      }
    }
  }

  return Math.max(1, total)
}

export function calculateMaxHPFromScores(
  progression: Progression | undefined | null,
  scores: AbilityScores,
  bonuses: AbilityBonuses,
  options?: { averageHp?: boolean; classesData?: Class5e[] },
): number {
  const conTotal =
    scores.constitution + (bonuses.constitution ?? []).reduce((s, b) => s + b.value, 0)
  const conMod = getAbilityModifier(Math.min(conTotal, 20))
  return calculateMaxHP(progression, conMod, options)
}

export function isMaxLevel(progression: Progression | undefined | null): boolean {
  return getTotalLevel(progression) >= MAX_CHARACTER_LEVEL
}

/** Validate that a proposed multiclass is legal (total doesn't exceed 20). */
export function canGainLevel(
  progression: Progression | undefined | null,
  additionalLevels = 1,
): boolean {
  return getTotalLevel(progression) + additionalLevels <= MAX_CHARACTER_LEVEL
}

/**
 * Match a stored character field (name + optional source) against a game data entry.
 * When the character was saved without a source, falls back to name-only match.
 */
export function matchesGameDataEntry(
  charName: string | undefined,
  charSource: string | undefined,
  entry: { name: string; source?: string },
): boolean {
  if (!charName) return false
  return charSource
    ? entry.name === charName && (entry.source ?? '') === charSource
    : entry.name === charName
}
