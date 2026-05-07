import type { Class5e, Subclass5e } from '@/types/5etools'

export type CasterProgression = 'full' | '1/2' | '1/3' | 'pact' | 'artificer' | 'none'

/**
 * Canonical map of caster progression keys to their full display names.
 * Mirrors `Parser.SP_CASTER_PROGRESSION_TO_FULL` from the 5etools source,
 * extended with 'artificer' and 'none' for our internal CasterProgression type.
 */
export const CASTER_PROGRESSION_TO_FULL: Readonly<Record<CasterProgression, string>> = {
  full: 'Full',
  '1/2': 'Half',
  '1/3': 'One-Third',
  pact: 'Pact Magic',
  artificer: 'Artificer',
  none: 'None',
}

/** Convert a caster progression key to its full display name. */
export function casterProgressionToFull(progression: string): string {
  return CASTER_PROGRESSION_TO_FULL[progression as CasterProgression] ?? progression
}

/**
 * Fallback-only table used when class spell progression data is unavailable.
 * Canonical values should come from parsed class data (`rowsSpellProgression`).
 * Each row is [level-1 slots, level-2 slots, ..., level-9 slots].
 */
const FALLBACK_STANDARD_SPELL_SLOTS_BY_CASTER_LEVEL: number[][] = [
  // Index 0 intentionally unused so index === caster level.
  [],
  /* lv 1  */ [2],
  /* lv 2  */ [3],
  /* lv 3  */ [4, 2],
  /* lv 4  */ [4, 3],
  /* lv 5  */ [4, 3, 2],
  /* lv 6  */ [4, 3, 3],
  /* lv 7  */ [4, 3, 3, 1],
  /* lv 8  */ [4, 3, 3, 2],
  /* lv 9  */ [4, 3, 3, 3, 1],
  /* lv 10 */ [4, 3, 3, 3, 2],
  /* lv 11 */ [4, 3, 3, 3, 2, 1],
  /* lv 12 */ [4, 3, 3, 3, 2, 1],
  /* lv 13 */ [4, 3, 3, 3, 2, 1, 1],
  /* lv 14 */ [4, 3, 3, 3, 2, 1, 1],
  /* lv 15 */ [4, 3, 3, 3, 2, 1, 1, 1],
  /* lv 16 */ [4, 3, 3, 3, 2, 1, 1, 1],
  /* lv 17 */ [4, 3, 3, 3, 3, 1, 1, 1, 1],
  /* lv 18 */ [4, 3, 3, 3, 3, 2, 1, 1, 1],
  /* lv 19 */ [4, 3, 3, 3, 3, 2, 2, 1, 1],
  /* lv 20 */ [4, 3, 3, 3, 3, 2, 2, 2, 1],
]

/**
 * Fallback-only pact slot count table.
 * Prefer pact slot extraction from `classTableGroups.rows` when available.
 */
const FALLBACK_PACT_SLOT_COUNT = [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]

/**
 * Fallback-only pact slot level table.
 * Prefer pact slot extraction from `classTableGroups.rows` when available.
 */
const FALLBACK_PACT_SLOT_LEVEL = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]

// Used only as a last-resort fallback when class data is not loaded.
// Prefer Class5e.casterProgression read from parsed data files.
export const FALLBACK_CLASS_CASTER_PROGRESSION: Record<string, CasterProgression> = {
  Bard: 'full',
  Cleric: 'full',
  Druid: 'full',
  Sorcerer: 'full',
  Wizard: 'full',
  Artificer: 'artificer', // data says 'artificer' (ceiling half-caster), not '1/2'
  Paladin: '1/2',
  Ranger: '1/2',
  Warlock: 'pact',
  Barbarian: 'none',
  Fighter: 'none',
  Monk: 'none',
  Rogue: 'none',
}

export interface SpellSlotLevel {
  max: number
  used: number
  isPactMagic?: boolean
}

export type SpellSlotsResult = Partial<Record<number, SpellSlotLevel>>

export function getCasterLevelContribution(
  progression: CasterProgression,
  classLevel: number,
): number {
  if (progression === 'full') return classLevel
  if (progression === '1/2') return Math.floor(classLevel / 2)
  if (progression === '1/3') return Math.floor(classLevel / 3)
  if (progression === 'artificer') return Math.ceil(classLevel / 2)
  return 0
}

export function getEffectiveCasterProgression(
  classData: Class5e | undefined,
  subclassData?: Subclass5e,
): CasterProgression {
  const classProgression = (classData?.casterProgression as CasterProgression | undefined) ?? 'none'
  const subclassProgression = subclassData?.casterProgression as CasterProgression | undefined

  if (subclassProgression && classProgression === 'none') {
    return subclassProgression
  }

  return classProgression
}

export function getEffectiveSpellcastingAbility(
  classData: Class5e | undefined,
  subclassData?: Subclass5e,
): string | undefined {
  return subclassData?.spellcastingAbility ?? classData?.spellcastingAbility
}

function validateFallbackProgression(className: string, parsedCasterProgression?: string): void {
  if (!parsedCasterProgression) return
  const fallback = FALLBACK_CLASS_CASTER_PROGRESSION[className]
  if (fallback && fallback !== parsedCasterProgression) {
    console.warn(
      `[spellSlots] Fallback caster progression mismatch for ${className}: fallback=${fallback}, parsed=${parsedCasterProgression}`,
    )
  }
}

/** Return the standard (non-pact) spell slot maximums for a given `casterLevel`.
 * Uses the fallback static table. For single-class characters, prefer
 * `getSpellSlotsFromClassData` which reads the parsed progression directly.
 * This function is correct for multiclass combined caster levels (PHB rules).
 */
export function getStandardSpellSlots(casterLevel: number): SpellSlotsResult {
  if (casterLevel < 1 || casterLevel > 20) return {}
  const row = FALLBACK_STANDARD_SPELL_SLOTS_BY_CASTER_LEVEL[casterLevel] ?? []
  const result: SpellSlotsResult = {}
  for (let sl = 1; sl <= 9; sl++) {
    const count = row[sl - 1]
    if (count) result[sl] = { max: count, used: 0 }
  }
  return result
}

/** Return pact magic slot maximums for a Warlock of the given `level`. */
export function getPactMagicSlots(level: number): SpellSlotsResult {
  if (level < 1 || level > 20) return {}
  if (import.meta.env.DEV) {
    console.warn(
      `[spellSlots] getPactMagicSlots: using fallback table for level ${level}. ` +
        'Prefer getPactMagicSlotsFromClassData when class data is available.',
    )
  }
  const count = FALLBACK_PACT_SLOT_COUNT[level]
  const slotLevel = FALLBACK_PACT_SLOT_LEVEL[level]
  if (!count) return {}
  return { [slotLevel]: { max: count, used: 0, isPactMagic: true } }
}

function findColumnIndex(labels: unknown[], matcher: (text: string) => boolean): number {
  return labels.findIndex((label) => {
    if (typeof label !== 'string') return false
    return matcher(label.toLowerCase())
  })
}

function getPactMagicSlotsFromClassData(
  classData: Class5e,
  level: number,
): SpellSlotsResult | null {
  const classTableGroups = Array.isArray(classData.classTableGroups)
    ? (classData.classTableGroups as Array<{ colLabels?: unknown[]; rows?: unknown[] }>)
    : []

  for (const group of classTableGroups) {
    const labels = Array.isArray(group.colLabels) ? group.colLabels : []
    const rows = Array.isArray(group.rows) ? group.rows : []
    if (labels.length === 0 || rows.length < level) continue

    const slotsIndex = findColumnIndex(labels, (text) => text.includes('spell slots'))
    const slotLevelIndex = findColumnIndex(labels, (text) => text.includes('slot level'))
    if (slotsIndex < 0 || slotLevelIndex < 0) continue

    const row = rows[level - 1]
    if (!Array.isArray(row)) continue

    const slotCount = row[slotsIndex]
    const rawSlotLevel = row[slotLevelIndex]
    if (typeof slotCount !== 'number' || slotCount <= 0) return {}

    // Slot level may be a number or a 5etools filter tag like "{@filter 1st|spells|level=1|...}"
    let pactSlotLevel: number
    if (typeof rawSlotLevel === 'number') {
      pactSlotLevel = rawSlotLevel
    } else if (typeof rawSlotLevel === 'string') {
      const match = rawSlotLevel.match(/level=(\d+)/)
      if (!match) return null
      pactSlotLevel = Number.parseInt(match[1], 10)
    } else {
      return null
    }
    if (pactSlotLevel <= 0) return {}

    return {
      [pactSlotLevel]: {
        max: slotCount,
        used: 0,
        isPactMagic: true,
      },
    }
  }

  return null
}

/**
 * Read spell slot maximums directly from a class object's `classTableGroups` data.
 * This is the preferred approach — it handles all progression types correctly,
 * including 'artificer', without needing level-divisor logic.
 *
 * Returns `null` when the class has no `rowsSpellProgression` table
 * (e.g. Warlock, whose pact slot data is in a complex inline row format).
 * In that case, fall back to `calculateSpellSlots`.
 */
export function getSpellSlotsFromClassData(
  classData: Class5e,
  level: number,
): SpellSlotsResult | null {
  if (classData.casterProgression === 'pact') {
    const pact = getPactMagicSlotsFromClassData(classData, level)
    if (pact) return pact
  }

  const classTableGroups = (classData.classTableGroups ?? []) as Array<{
    rowsSpellProgression?: unknown[]
  }>

  const row =
    classData.spellSlotProgression?.[level - 1] ??
    classTableGroups.find((g) => Array.isArray(g.rowsSpellProgression))?.rowsSpellProgression?.[
      level - 1
    ]
  if (!Array.isArray(row)) return null

  const result: SpellSlotsResult = {}
  for (let sl = 1; sl <= row.length; sl++) {
    const count = row[sl - 1]
    if (count && count > 0) result[sl] = { max: count, used: 0 }
  }
  return result
}

export function getMaxSpellLevelForClassLevel(classData: Class5e, level: number): number {
  const spellSlots = getSpellSlotsFromClassData(classData, level)
  if (spellSlots) {
    return Object.keys(spellSlots)
      .map((key) => Number.parseInt(key, 10))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0)
  }

  const progression = (classData.casterProgression as CasterProgression | undefined) ?? 'none'
  const fallbackSlots =
    progression === 'pact'
      ? getPactMagicSlots(level)
      : getStandardSpellSlots(getCasterLevelContribution(progression, level))
  return Object.keys(fallbackSlots)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => !Number.isNaN(value))
    .reduce((max, value) => Math.max(max, value), 0)
}

/**
 * Calculate the maximum spell slot array for a class at a given level.
 * Prefer `getSpellSlotsFromClassData` when the Class5e object is available.
 * This fallback uses the known-class lookup table when only a name is provided.
 *
 * @param className         - e.g. "Wizard"
 * @param level             - character class level (1–20)
 * @param casterProgression - from `Class5e.casterProgression`; overrides the table
 */
export function calculateSpellSlots(
  className: string,
  level: number,
  casterProgression?: string,
): SpellSlotsResult {
  validateFallbackProgression(className, casterProgression)

  const progression: CasterProgression =
    (casterProgression as CasterProgression) ??
    (() => {
      if (import.meta.env.DEV && className) {
        console.warn(
          `[spellSlots] calculateSpellSlots: no casterProgression supplied for "${className}"; ` +
            'falling back to FALLBACK_CLASS_CASTER_PROGRESSION. Pass class data for accurate results.',
        )
      }
      return FALLBACK_CLASS_CASTER_PROGRESSION[className] ?? 'none'
    })()

  if (progression === 'none') return {}
  if (progression === 'pact') return getPactMagicSlots(level)

  const casterLevel = getCasterLevelContribution(progression, level)

  return getStandardSpellSlots(casterLevel)
}

/**
 * Is the given class name a spellcasting class (by the known progression table)?
 * Returns `false` for classes not in the table; use with game-data class objects
 * where `casterProgression` is available for better coverage.
 */
export function isSpellcaster(className: string, casterProgression?: string): boolean {
  validateFallbackProgression(className, casterProgression)

  const prog =
    (casterProgression as CasterProgression) ??
    (() => {
      if (import.meta.env.DEV && className) {
        console.warn(
          `[spellSlots] isSpellcaster: no casterProgression supplied for "${className}"; ` +
            'falling back to FALLBACK_CLASS_CASTER_PROGRESSION. Pass class data for accurate results.',
        )
      }
      return FALLBACK_CLASS_CASTER_PROGRESSION[className]
    })()
  return !!prog && prog !== 'none'
}

/**
 * Convert the stored `SpellSlots` format (named keys) to a number-keyed partial
 * record, preserving the `used` count while updating `max` from calculated slots.
 *
 * @param calculated   - slots calculated from class + level
 * @param storedUsed   - existing used counts keyed by spell level (1–9)
 */
export function mergeSpellSlots(
  calculated: SpellSlotsResult,
  storedUsed: Record<number, number>,
): SpellSlotsResult {
  const result: SpellSlotsResult = {}
  for (let sl = 1; sl <= 9; sl++) {
    const calc = calculated[sl]
    if (!calc) continue
    const used = Math.min(storedUsed[sl] ?? 0, calc.max)
    result[sl] = { ...calc, used }
  }
  return result
}
