import { findClassReference } from '@/lib/5etools/classReference'
import type { Class5e } from '@/types/5etools'
import type {
  AbilityScores,
  Character,
  CharacterClassEntry,
  HitPointAdjustment,
  HitPointGain,
  HitPointLevelOverride,
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
  hitPointLevelOverrides?: HitPointLevelOverride[]
  initialClass?: Character['initialClass']
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

export function getHitPointLevelKey({
  className,
  classSource,
  classLevel,
}: Pick<HitPointGain, 'className' | 'classSource' | 'classLevel'>) {
  return JSON.stringify([className, classSource, classLevel])
}

/** Resolve class-level HP without inferring the order of unrecorded multiclass levels. */
export function getHitPointLevelLog(
  entries: readonly CharacterClassEntry[] | undefined | null,
  conModifier: number,
  {
    averageHp = true,
    classesData,
    hitPointGains,
    hitPointLevelOverrides,
    initialClass,
  }: HitPointCalculationOptions = {},
) {
  const classes = (entries ?? []).filter(({ levels }) => levels > 0)
  const startingClass = findClassReference(initialClass ?? {}, classes) ?? classes[0]
  const edited = new Map(hitPointLevelOverrides?.map((gain) => [getHitPointLevelKey(gain), gain]))
  return classes.flatMap((entry, classIndex) => {
    const classData = findClassReference(entry, classesData)
    const catalogDie = classData?.hd?.faces
    const knownDie =
      typeof catalogDie === 'number' && Number.isInteger(catalogDie) && catalogDie > 0
    const ambiguous =
      classes.filter((row) => row.name === entry.name && row.source === entry.source).length > 1
    return Array.from({ length: entry.levels }, (_, index) => {
      const owner = { className: entry.name, classSource: entry.source, classLevel: index + 1 }
      const key = getHitPointLevelKey(owner)
      const startingLevel = entry === startingClass && index === 0
      const original = startingLevel
        ? undefined
        : hitPointGains?.find((gain) => getHitPointLevelKey(gain) === key)
      const override = ambiguous ? undefined : edited.get(key)
      const recorded = override ?? original
      const hitDie = recorded?.hitDie ?? (knownDie ? catalogDie : getHitDiceFromClass(undefined))
      const useFullDie = startingLevel || !averageHp
      const dieResult = recorded?.dieResult ?? (useFullDie ? hitDie : Math.floor(hitDie / 2) + 1)
      return {
        key,
        rowKey: ambiguous ? JSON.stringify([key, classIndex]) : key,
        ...owner,
        characterLevel: startingLevel
          ? 1
          : (original?.characterLevel ?? (classes.length === 1 ? index + 1 : undefined)),
        hitDie,
        dieResult,
        method: recorded?.method ?? (useFullDie ? ('full' as const) : ('average' as const)),
        hp: Math.max(1, dieResult + conModifier),
        canEdit:
          !ambiguous &&
          !!entry.source &&
          (!!recorded || (knownDie && !classData?.sourceIdentityConflict)),
      }
    })
  })
}

/**
 * Calculate maximum hit points for a character.
 *
 * Sums the per-level contributions from {@link getHitPointLevelLog}.
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
  const log = getHitPointLevelLog(entries, conModifier, options)
  const total = log.reduce((sum, { hp }) => sum + hp, 0)
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
    hitPointLevelOverrides: character.hitPointLevelOverrides,
    initialClass: character.initialClass,
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
