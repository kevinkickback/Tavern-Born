import type { Class5e } from '@/types/5etools'
import type { AbilityScores } from '@/types/character'
import {
  ABILITY_ABBREV_ORDER,
  ABILITY_ABBREV_TO_FULL,
  ABILITY_ABBREV_TO_TITLE,
  toAbilityAbbrev,
} from './abilityNames'

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const

export const POINT_BUY_BUDGET = 27

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

export const POINT_BUY_MIN = 8
export const POINT_BUY_MAX = 15

export const ABILITY_SCORE_MIN = 1
export const ABILITY_SCORE_MAX = 20
export const ABILITY_SCORE_ABSOLUTE_MAX = 30

export const MAX_CHARACTER_LEVEL = 20
export const MAX_ATTUNEMENT_SLOTS = 3
export const CARRY_CAPACITY_MULTIPLIER = 15
export const LIGHT_ENCUMBRANCE_MULTIPLIER = 5
export const HEAVY_ENCUMBRANCE_MULTIPLIER = 10

export const MAX_CHARACTER_SIZE = 10 * 1024 * 1024
export const MAX_PORTRAIT_SIZE = 5 * 1024 * 1024

export const PROFICIENCY_TYPES = {
  SKILLS: 'skills',
  SAVING_THROWS: 'savingThrows',
  WEAPONS: 'weapons',
  TOOLS: 'tools',
  ARMOR: 'armor',
  LANGUAGES: 'languages',
} as const

export type ProficiencyType = (typeof PROFICIENCY_TYPES)[keyof typeof PROFICIENCY_TYPES]

/**
 * Parse a hit dice string (e.g. "1d8", "d10") into its numeric face value.
 * Returns 8 as a safe default.
 */
export function parseHitDice(hitDice: string | undefined | null): number {
  const match = hitDice?.match(/d(\d+)/)
  return match ? Number.parseInt(match[1], 10) : 8
}

export function getHitDiceFromClass(cls: Class5e | undefined | null): number {
  return cls?.hd?.faces ?? 8
}

/**
 * Read ASI levels from parsed class feature references.
 * Falls back to the standard [4,8,12,16,19] if parsed refs are unavailable.
 */
const ASI_NAME_PATTERNS = ['ability score improvement', 'ability score increase', 'epic boon']

export function getASILevelsFromClass(cls: Class5e | undefined | null): number[] {
  if (cls?.classFeatureRefs && cls.classFeatureRefs.length > 0) {
    const levels = cls.classFeatureRefs
      .filter(
        (ref) =>
          ASI_NAME_PATTERNS.some((pattern) => ref.name.toLowerCase().includes(pattern)) &&
          typeof ref.level === 'number',
      )
      .map((ref) => ref.level as number)
      .filter((level, index, arr) => arr.indexOf(level) === index)

    if (levels.length > 0) {
      return levels.sort((a, b) => a - b)
    }
  }

  if (import.meta.env.DEV) {
    console.warn(
      `[gameRules] getASILevelsFromClass: no ASI levels found in classFeatureRefs for ${
        cls?.name ?? 'unknown'
      }; using standard Fighter/Rogue fallback [4,8,12,16,19]. ` +
        'This may be wrong for classes with more than 5 ASIs (e.g. Fighter, Barbarian).',
    )
  }
  return [4, 8, 12, 16, 19]
}

function normalizeReqKeyToAbilityAbv(key: string): string | null {
  return toAbilityAbbrev(key)
}

function sortedAbilityReqEntries(group: Record<string, number>): Array<[string, number]> {
  return Object.entries(group)
    .map(([k, v]) => [normalizeReqKeyToAbilityAbv(k), v] as const)
    .filter((entry): entry is [string, number] => !!entry[0])
    .sort(
      (a, b) =>
        ABILITY_ABBREV_ORDER.indexOf(a[0] as (typeof ABILITY_ABBREV_ORDER)[number]) -
        ABILITY_ABBREV_ORDER.indexOf(b[0] as (typeof ABILITY_ABBREV_ORDER)[number]),
    )
}

function formatAbilityRequirementGroup(group: Record<string, number>, joiner = ', '): string {
  return sortedAbilityReqEntries(group)
    .map(([abv, min]) => `${ABILITY_ABBREV_TO_TITLE[abv]} ${min}`)
    .join(joiner)
}

/**
 * Check whether the given ability scores meet the multiclassing requirements
 * for a class, reading the requirements directly from the Class5e data.
 */
export function checkMulticlassRequirements(
  cls: Class5e,
  abilityScores: AbilityScores,
): { meetsRequirements: boolean; requirementText: string } {
  const scores = abilityScores as unknown as Record<string, number>
  const getScore = (ab: string): number => {
    const full = ABILITY_ABBREV_TO_FULL[ab.toLowerCase()] ?? ab.toLowerCase()
    return scores[full] ?? scores[ab.toLowerCase()] ?? 0
  }

  const checkGroup = (group: Record<string, number>) =>
    sortedAbilityReqEntries(group).every(([ab, min]) => getScore(ab) >= min)

  const reqs = cls.multiclassing?.requirements
  if (!reqs) {
    // XPHB/2024-edition classes omit multiclassing.requirements but encode
    // prerequisites in primaryAbility. Each array item is an alternative group
    // (OR between items); within a group all listed abilities must be >= 13.
    const primaryAbility = cls.primaryAbility as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(primaryAbility) || primaryAbility.length === 0) {
      return { meetsRequirements: true, requirementText: '' }
    }
    const SCORE_REQ = 13
    const groups: Array<Record<string, number>> = primaryAbility.map((group) =>
      Object.fromEntries(
        Object.keys(group)
          .filter((k) => group[k] === true && normalizeReqKeyToAbilityAbv(k))
          .map((k) => [k, SCORE_REQ]),
      ),
    )
    const meetsRequirements = groups.some(checkGroup)
    const requirementText = groups
      .map((g) => formatAbilityRequirementGroup(g))
      .filter(Boolean)
      .join(' or ')
    return { meetsRequirements, requirementText }
  }

  const baseGroup = Object.fromEntries(
    Object.entries(reqs).filter(
      ([k, v]) => k !== 'or' && typeof v === 'number' && normalizeReqKeyToAbilityAbv(k),
    ),
  ) as Record<string, number>

  const hasBaseReqs = Object.keys(baseGroup).length > 0
  const hasOrReqs = Array.isArray(reqs.or) && reqs.or.length > 0

  const baseMet = hasBaseReqs ? checkGroup(baseGroup) : true
  const orMet = hasOrReqs ? (reqs.or as Array<Record<string, number>>).some(checkGroup) : true

  const orPart = hasOrReqs
    ? (reqs.or as Array<Record<string, number>>)
        .map((group) => formatAbilityRequirementGroup(group, ' or '))
        .filter(Boolean)
        .join('; ')
    : ''

  const basePart = hasBaseReqs ? formatAbilityRequirementGroup(baseGroup) : ''

  const requirementText = [orPart, basePart].filter(Boolean).join('; ')

  return {
    meetsRequirements: baseMet && orMet,
    requirementText,
  }
}

export function getProficiencyBonus(totalLevel: number): number {
  const clampedLevel = Math.min(Math.max(Math.floor(totalLevel), 1), MAX_CHARACTER_LEVEL)
  return Math.floor((clampedLevel - 1) / 4) + 2
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function getPointBuyCost(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0
}

export function calculatePointBuyTotal(scores: Record<string, number>): number {
  return Object.values(scores).reduce((sum, s) => sum + getPointBuyCost(s), 0)
}

export function getRemainingPointBuy(scores: Record<string, number>): number {
  return POINT_BUY_BUDGET - calculatePointBuyTotal(scores)
}

export function getCarryCapacity(strengthScore: number): number {
  return strengthScore * CARRY_CAPACITY_MULTIPLIER
}
