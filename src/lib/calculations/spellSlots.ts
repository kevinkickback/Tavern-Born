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

export function casterProgressionToFull(progression: string): string {
  return CASTER_PROGRESSION_TO_FULL[progression as CasterProgression] ?? progression
}

export interface SpellSlotLevel {
  max: number
  used: number
  isPactMagic?: boolean
}

export type SpellSlotsResult = Partial<Record<number, SpellSlotLevel>>

export type SpellSlotRuleset = '2014' | '2024'

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

export function getStandardSpellSlotsFromClassData(
  classes: Iterable<Class5e>,
  casterLevel: number,
  ruleset: SpellSlotRuleset,
): SpellSlotsResult | null {
  const source = ruleset === '2024' ? 'XPHB' : 'PHB'
  const candidates = Array.from(classes).filter(
    (classData) => classData.source === source && classData.casterProgression === 'full',
  )
  candidates.sort((left, right) => Number(right.name === 'Wizard') - Number(left.name === 'Wizard'))
  for (const candidate of candidates) {
    const slots = getSpellSlotsFromClassData(candidate, casterLevel)
    if (slots !== null) return slots
  }

  return null
}

export function validateParsedSpellSlotProgressions(classes: Class5e[]): void {
  for (const ruleset of ['2014', '2024'] as const) {
    const source = ruleset === '2024' ? 'XPHB' : 'PHB'
    if (!classes.some((classData) => classData.source === source)) continue
    if (!getStandardSpellSlotsFromClassData(classes, 20, ruleset)) {
      console.warn(
        `[spellSlots] Missing parsed ${ruleset} full-caster progression at level 20 (${source}).`,
      )
    }
  }

  for (const classData of classes) {
    if (classData.casterProgression !== 'pact') continue
    if (getSpellSlotsFromClassData(classData, 1) !== null) continue
    console.warn(
      `[spellSlots] Missing parsed pact progression for ${classData.name}|${classData.source}.`,
    )
  }
}

export function getMaxSpellLevelForClassLevel(
  classData: Class5e,
  level: number,
  standardProgressionClasses: Iterable<Class5e> = [],
  ruleset: SpellSlotRuleset = classData.edition === 'one' || classData.source === 'XPHB'
    ? '2024'
    : '2014',
): number {
  const spellSlots = getSpellSlotsFromClassData(classData, level)
  if (spellSlots) {
    return Object.keys(spellSlots)
      .map((key) => Number.parseInt(key, 10))
      .filter((value) => !Number.isNaN(value))
      .reduce((max, value) => Math.max(max, value), 0)
  }

  const progression = (classData.casterProgression as CasterProgression | undefined) ?? 'none'
  if (progression === 'pact' || progression === 'none') return 0

  const standardSlots = getStandardSpellSlotsFromClassData(
    standardProgressionClasses,
    getCasterLevelContribution(progression, level),
    ruleset,
  )
  if (!standardSlots) return 0

  return Object.keys(standardSlots)
    .map((key) => Number.parseInt(key, 10))
    .filter((value) => !Number.isNaN(value))
    .reduce((max, value) => Math.max(max, value), 0)
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
