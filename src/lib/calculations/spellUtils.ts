import type { CastingTime, SpellComponents, SpellDuration, SpellRange } from '@/types/5etools'

export const SPELL_SCHOOL_NAMES: Record<string, string> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  I: 'Illusion',
  N: 'Necromancy',
  P: 'Psionic',
  T: 'Transmutation',
  V: 'Evocation',
}

export function getSchoolName(abbreviation: string | undefined): string {
  if (!abbreviation) return 'Unknown'
  return SPELL_SCHOOL_NAMES[abbreviation.toUpperCase()] ?? abbreviation
}

// Units that are "singletons" — when count is 1, the number is omitted
const SP_TIME_SINGLETONS = new Set(['action', 'bonus', 'reaction', 'round'])

export function formatCastingTime(time: CastingTime[] | undefined): string {
  if (!time || time.length === 0) return 'N/A'
  const t = time[0]
  const unitKey = t.unit.toLowerCase()
  const unitDisplay =
    unitKey === 'bonus' ? 'Bonus Action' : unitKey.charAt(0).toUpperCase() + unitKey.slice(1)
  // Singletons with count=1: just the unit name ("Action", "Bonus Action", "Reaction", "Round")
  if (t.number === 1 && SP_TIME_SINGLETONS.has(unitKey)) {
    return unitDisplay
  }
  // Timed: "1 minute", "10 minutes", "8 hours", etc.
  const rawUnit = unitKey === 'bonus' ? 'bonus action' : unitKey
  const plural = t.number > 1 ? 's' : ''
  return `${t.number} ${rawUnit}${plural}`
}

const RANGE_DIST_TYPE_TO_FULL: Record<string, string> = {
  self: 'Self',
  touch: 'Touch',
  sight: 'Sight',
  unlimited: 'Unlimited',
  plane: 'Unlimited on the same plane',
  special: 'Special',
}

// Area-of-effect spell range types — range is "Self" per canonical parser
const AREA_RANGE_TYPES = new Set([
  'line',
  'cube',
  'cone',
  'emanation',
  'radius',
  'sphere',
  'hemisphere',
  'cylinder',
])

function getSingularUnit(unit: string): string {
  switch (unit?.toLowerCase()) {
    case 'feet':
      return 'foot'
    case 'miles':
      return 'mile'
    case 'yards':
      return 'yard'
    default:
      return unit
  }
}

export function formatRange(range: SpellRange | undefined): string {
  if (!range) return 'N/A'
  if (range.type === 'special') return 'Special'

  // Area spells (cone, sphere, line, etc.) cast from self
  if (AREA_RANGE_TYPES.has(range.type)) return 'Self'

  if (range.type === 'point') {
    const dist = range.distance
    if (!dist) return 'N/A'
    // self / touch / sight / unlimited / special as distance type
    const distFull = RANGE_DIST_TYPE_TO_FULL[dist.type?.toLowerCase()]
    if (distFull) return distFull
    // Numeric range — singular for amount=1 ("1 foot" not "1 feet")
    if (dist.amount !== undefined) {
      const unit = dist.amount === 1 ? getSingularUnit(dist.type) : dist.type
      return `${dist.amount} ${unit}`
    }
    return dist.type ?? 'N/A'
  }

  // Fallback: legacy/homebrew formats that put self/touch directly on range.type
  const directFull = RANGE_DIST_TYPE_TO_FULL[range.type?.toLowerCase()]
  if (directFull) return directFull

  return range.type ?? 'N/A'
}

export function formatDuration(duration: SpellDuration[] | undefined): string {
  if (!duration || duration.length === 0) return 'N/A'
  const d = duration[0]
  if (d.type === 'instant') return 'Instantaneous'
  if (d.type === 'permanent') return 'Permanent'
  if (d.type === 'special') return 'Special'
  if (d.type === 'timed' && d.duration) {
    const conc = d.concentration ? 'Concentration, up to ' : ''
    const unit = d.duration.amount === 1 ? d.duration.type : `${d.duration.type}s`
    return `${conc}${d.duration.amount} ${unit}`
  }
  if (d.type === 'until_dispelled') return 'Until dispelled'
  return d.type ?? 'N/A'
}

export function formatComponents(components: SpellComponents | undefined): string {
  if (!components) return 'N/A'
  const parts: string[] = []
  if (components.v) parts.push('V')
  if (components.s) parts.push('S')
  if (components.m) {
    const mat =
      typeof components.m === 'string'
        ? components.m
        : ((components.m as { text?: string }).text ?? '')
    parts.push(mat ? `M (${mat})` : 'M')
  }
  return parts.length ? parts.join(', ') : 'N/A'
}

/** Returns the ordinal suffix for a number: 1 → "st", 2 → "nd", etc. */
export function ordinalSuffix(n: number): string {
  const abs = Math.abs(n)
  const v = abs % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (abs % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** E.g. 0 → "Cantrip", 1 → "1st-level", 2 → "2nd-level" */

/** E.g. 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th" */
export function getOrdinalForm(n: number): string {
  return `${n}${ordinalSuffix(n)}`
}

/** E.g. 0 → "Cantrip", 1 → "1st-level", 2 → "2nd-level" */
export function formatSpellLevel(level: number): string {
  if (level === 0) return 'Cantrip'
  return `${level}${ordinalSuffix(level)}-level`
}
