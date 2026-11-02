import type { ClassPreparationRule } from '@/types/classCasting'
import { getParsedClassSpellSlotProgression } from './classSpellSlotTable'
import {
  getOptionalDeclarationOwner,
  type OptionalDeclarationOwner,
  type OptionalDeclarationRule,
  optionalDeclarationDigest,
} from './optionalClassDeclarationStructure'

type Row = Record<string, unknown>
export type CastingDomain = 'class-cantrip' | 'class-known' | 'class-spellbook' | 'class-arcanum'
interface CastingGain {
  level: number
  count: number
  spellLevel?: number
}
export interface CastingProducerRule {
  declaration: OptionalDeclarationRule
  /** Exact supported source packages with the same owner/target/gain and numeric meaning. */
  declarationAlternatives?: OptionalDeclarationRule[]
  parent: string
  suppliers: Record<string, 'class' | 'subclass'>
  domains: Partial<Record<CastingDomain, CastingGain[]>>
  preparation?: ClassPreparationRule
  schools?: readonly string[]
  unrestrictedGains?: readonly number[]
  /** A prose-only shared casting clause lives in another exact same-owner declaration. */
  requiresDeclaration?: { target: string; level: number }
}

/** Numeric entitlement from the parent map; this alone does not certify the feature's meaning. */
export function getFixedLevelCastingGain(value: unknown, level: number): CastingGain | undefined {
  if (
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level > 20 ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    return undefined
  const row = (value as Row)[String(level)]
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const cells = Object.entries(row)
  if (cells.length !== 1) return undefined
  const [key, count] = cells[0]
  if (!/^[1-9]$/.test(key) || !Number.isSafeInteger(count) || (count as number) < 1)
    return undefined
  return { level, count: count as number, spellLevel: Number(key) }
}
export interface CastingParentRule {
  owner: ['class', string, string]
  rawDigest: string
  parsedDigest: string
  standard: boolean
}
/** Fixed consumed-field vocabulary; absent fields remain certified fallback inputs. */
const fields = [
  'name',
  'source',
  'edition',
  'spellcastingAbility',
  'casterProgression',
  'spellSlotProgression',
  'classTableGroups',
  'cantripProgression',
  'spellsKnownProgression',
  'spellsKnownProgressionFixed',
  'spellsKnownProgressionFixedByLevel',
  'preparedSpells',
  'preparedSpellsProgression',
  'preparedSpellsChange',
] as const
export const castingParentKey = (owner: OptionalDeclarationOwner) =>
  JSON.stringify(['class', owner[1], owner[2]])

export function castingParentProjection(row: Row, parsed = false) {
  const owns = Object.prototype.hasOwnProperty
  return fields.map((field) => {
    if (parsed && field === 'spellSlotProgression')
      return [field, true, getParsedClassSpellSlotProgression(row) ?? null]
    return [field, owns.call(row, field), typeof row[field], row[field]]
  })
}

export function castingParsedParentMatches(row: Row, rule: CastingParentRule): boolean {
  const projected = castingParentProjection(row, true)
  // The parser derives this field from raw tables; an independently changed parsed array is invalid.
  const derived = getParsedClassSpellSlotProgression(row)
  if (
    derived === undefined
      ? row.spellSlotProgression !== undefined
      : !Array.isArray(row.spellSlotProgression) ||
        optionalDeclarationDigest(row.spellSlotProgression) !== optionalDeclarationDigest(derived)
  )
    return false
  return optionalDeclarationDigest(projected) === rule.parsedDigest
}

export function getCastingParentOwner(row: Row) {
  return getOptionalDeclarationOwner(row, 'class') as ['class', string, string] | undefined
}

/** Generation arithmetic is classified before schedules are admitted as numeric acquisitions. */
export function classifyCastingDomains(row: Row): CastingProducerRule['domains'] {
  if (typeof row.spellcastingAbility !== 'string' || !row.spellcastingAbility.trim()) return {}
  const delta = (value: unknown): CastingGain[] => {
    if (!Array.isArray(value) || value.length !== 20) return []
    if (!value.every((count) => Number.isInteger(count) && count >= 0)) return []
    return value.flatMap((count, index) => {
      const gained = count - (index === 0 ? 0 : value[index - 1])
      return gained > 0 ? [{ level: index + 1, count: gained }] : []
    })
  }
  const result: CastingProducerRule['domains'] = {}
  const cantrips = delta(row.cantripProgression)
  if (cantrips.length) result['class-cantrip'] = cantrips
  if (Array.isArray(row.spellsKnownProgressionFixed)) {
    const increments = row.spellsKnownProgressionFixed
    if (
      increments.length === 20 &&
      increments.every((count) => Number.isInteger(count) && count >= 0)
    )
      result['class-spellbook'] = increments.flatMap((count, index) =>
        count > 0 ? [{ level: index + 1, count }] : [],
      )
  } else {
    const known = delta(
      row.spellsKnownProgression ??
        (row.preparedSpellsChange === 'level' ? row.preparedSpellsProgression : undefined),
    )
    if (known.length) result['class-known'] = known
  }
  return result
}
