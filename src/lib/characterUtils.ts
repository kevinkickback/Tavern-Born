import type { Class5e } from '@/types/5etools'
import type {
  AbilityScores,
  Character,
  CharacterClassEntry,
  HitPointAdjustment,
  HitPointGain,
} from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import {
  getCharacterEffectResolutionContext,
  getCharacterEffects,
} from './calculations/characterEffects'
import { resolveNumericEffect } from './calculations/effects'
import { getAbilityModifier, getHitDiceFromClass } from './calculations/gameRules'

export interface HitPointCalculationOptions {
  averageHp?: boolean
  classesData?: readonly Class5e[]
  hitPointGains?: HitPointGain[]
}

export function getCharacterClassEntries(
  character: Pick<Character, 'classProgression'> | null | undefined,
): CharacterClassEntry[] {
  return character?.classProgression ?? []
}

export function getTotalClassLevels(
  entries: readonly CharacterClassEntry[] | undefined | null,
): number {
  if (!entries?.length) return 1
  return entries.reduce((sum, entry) => sum + (entry.levels || 0), 0)
}

/**
 * Derive total character level from a character object.
 *
 * Uses the authoritative source-qualified class progression.
 */
export function getTotalCharacterLevel(
  character: Pick<Character, 'classProgression'> | null | undefined,
): number {
  return getTotalClassLevels(getCharacterClassEntries(character))
}

/**
 * Per-level HP breakdown for a character.
 *
 * Index 0 is always 0 (unused sentinel). Index n contains the HP gained at level n.
 * Rules: full hit die at level 1 of the primary class, then a recorded result
 * or the fixed average at subsequent levels; minimum 1 per level. Characters
 * Pass `classesData` for accurate per-class hit dice; without it, falls back to
 * `entry.hitDice` string or d8.
 */
export function calculateHPBreakdown(
  entries: readonly CharacterClassEntry[] | undefined | null,
  conModifier: number,
  options?: HitPointCalculationOptions,
): number[] {
  const { averageHp = true, classesData, hitPointGains } = options ?? {}
  const breakdown: number[] = [0]
  const classes = entries ?? []
  let firstLevel = true

  for (const entry of classes) {
    const classLevels = Math.max(0, entry.levels || 0)
    if (classLevels <= 0) continue

    const classData = classesData?.find(
      (classData) => classData.name === entry.name && classData.source === entry.source,
    )
    const die = getHitDiceFromClass(classData)
    const avgRoll = Math.floor(die / 2) + 1

    for (let lv = 1; lv <= classLevels; lv++) {
      if (firstLevel && lv === 1) {
        breakdown.push(Math.max(1, die + conModifier))
        firstLevel = false
      } else {
        const recordedGain = hitPointGains?.find(
          (gain) =>
            gain.className === entry.name &&
            gain.classLevel === lv &&
            gain.classSource === entry.source,
        )
        const dieResult = recordedGain?.dieResult ?? (averageHp ? avgRoll : die)
        breakdown.push(Math.max(1, dieResult + conModifier))
      }
    }
  }

  return breakdown
}

/**
 * Calculate maximum hit points for a character.
 *
 * Sums the per-level breakdown from {@link calculateHPBreakdown}.
 * Returns at least 1 even with no class data.
 *
 * Pass `classesData` (from the game data store) for accurate per-class hit dice;
 * without it, falls back to `entry.hitDice` string or d8.
 */
export function calculateMaxHP(
  entries: readonly CharacterClassEntry[] | undefined | null,
  conModifier: number,
  options?: HitPointCalculationOptions,
): number {
  const breakdown = calculateHPBreakdown(entries, conModifier, options)
  const total = breakdown.reduce((sum, v) => sum + v, 0)
  return Math.max(1, total)
}

export function calculateHitPointAdjustmentTotal(
  adjustments: HitPointAdjustment[] | undefined,
  characterLevel: number,
): number {
  return (adjustments ?? []).reduce(
    (total, adjustment) =>
      total +
      (adjustment.mode === 'per-level'
        ? adjustment.amount * Math.max(1, characterLevel)
        : adjustment.amount),
    0,
  )
}

export function getMaxHitPointsOverride(character: Character): number | undefined {
  return typeof character.maxHitPointsOverride === 'number' && character.maxHitPointsOverride > 0
    ? character.maxHitPointsOverride
    : undefined
}

/**
 * Returns the character's effective max HP: the stored value when it has been
 * explicitly set (> 0), otherwise the value derived from class progression and
 * CON modifier.  Pass `classesData` for accurate per-class hit dice; without
 * it the calculation falls back to d8 per level.
 */
export function getEffectiveMaxHP(
  character: Character,
  classesData: readonly Class5e[] | undefined,
  effectiveAbilityScores: AbilityScores,
  sourceEffects: readonly CharacterEffect[] = [],
): number {
  const entries = getCharacterClassEntries(character)
  const conMod = getAbilityModifier(effectiveAbilityScores.constitution)
  const averageHp = character.variantRules?.averageHitPoints !== false
  const calculatedMaxHP = calculateMaxHP(entries, conMod, {
    averageHp,
    classesData,
    hitPointGains: character.hitPointGains,
  })
  const characterLevel = getTotalCharacterLevel(character)
  const resolved = resolveNumericEffect(
    calculatedMaxHP,
    { kind: 'hit-point-maximum' },
    getCharacterEffects(character, characterLevel, sourceEffects),
    getCharacterEffectResolutionContext(character),
  )
  return Math.max(1, Math.trunc(resolved.value))
}

/**
 * Match a stored source-qualified character field against a game data entry.
 */
export function matchesGameDataEntry(
  charName: string | undefined,
  charSource: string | undefined,
  entry: { name: string; source?: string },
): boolean {
  return (
    !!charName && !!charSource && entry.name === charName && (entry.source ?? '') === charSource
  )
}
