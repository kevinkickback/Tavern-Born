import type { Class5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassEntry,
  HitPointAdjustment,
  HitPointGain,
} from '@/types/character'
import { getAbilityModifier, getHitDiceFromClass } from './calculations/gameRules'

export interface HitPointCalculationOptions {
  averageHp?: boolean
  classesData?: Class5e[]
  hitPointGains?: HitPointGain[]
}

export function getCharacterClassEntries(
  character:
    | Pick<
        Character,
        'classProgression' | 'class' | 'classSource' | 'subclass' | 'subclassSource' | 'level'
      >
    | null
    | undefined,
): CharacterClassEntry[] {
  if (!character) return []
  if (character.classProgression && character.classProgression.length > 0) {
    return character.classProgression
  }
  if (!character.class) return []

  return [
    {
      name: character.class,
      source: character.classSource,
      levels: character.level,
      subclass: character.subclass,
      subclassSource: character.subclassSource,
    },
  ]
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
 * Uses `classProgression` when present, otherwise falls back gracefully to
 * the flat `character.level` field (preserved for single-class characters).
 * Preferred over reading `character.level` directly in hooks and selectors
 * so that multiclass progression is always honoured.
 */
export function getTotalCharacterLevel(
  character:
    | Pick<
        Character,
        'classProgression' | 'class' | 'classSource' | 'subclass' | 'subclassSource' | 'level'
      >
    | null
    | undefined,
): number {
  return getTotalClassLevels(getCharacterClassEntries(character))
}

/**
 * Per-level HP breakdown for a character.
 *
 * Index 0 is always 0 (unused sentinel). Index n contains the HP gained at level n.
 * Rules: full hit die at level 1 of the primary class, then a recorded result
 * or the fixed average at subsequent levels; minimum 1 per level. Characters
 * saved before roll tracking use the former max-die fallback when average HP
 * is disabled and no recorded result exists.
 *
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

    const classData =
      classesData?.find(
        (c) => c.name === entry.name && (entry.source == null || c.source === entry.source),
      ) ?? classesData?.find((c) => c.name === entry.name)
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
            (entry.source == null || gain.classSource == null || gain.classSource === entry.source),
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

/** Read the explicit override, with a fallback for pre-v6 character objects. */
export function getMaxHitPointsOverride(character: Character): number | undefined {
  if (typeof character.maxHitPointsOverride === 'number' && character.maxHitPointsOverride > 0) {
    return character.maxHitPointsOverride
  }
  return character.hitPoints.max > 0 ? character.hitPoints.max : undefined
}

/**
 * Returns the character's effective max HP: the stored value when it has been
 * explicitly set (> 0), otherwise the value derived from class progression and
 * CON modifier.  Pass `classesData` for accurate per-class hit dice; without
 * it the calculation falls back to d8 per level.
 */
export function getEffectiveMaxHP(character: Character, classesData?: Class5e[]): number {
  const entries = getCharacterClassEntries(character)
  const conMod = getAbilityModifier(character.abilityScores.constitution)
  const averageHp = character.variantRules?.averageHitPoints !== false
  const calculatedMaxHP = calculateMaxHP(entries, conMod, {
    averageHp,
    classesData,
    hitPointGains: character.hitPointGains,
  })
  const adjustedMaxHP = Math.max(
    1,
    calculatedMaxHP +
      calculateHitPointAdjustmentTotal(
        character.hitPointAdjustments,
        getTotalCharacterLevel(character),
      ),
  )
  return getMaxHitPointsOverride(character) ?? adjustedMaxHP
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
