import { toAbilityAbbrev, toAbilityName } from '@/lib/calculations/abilityNames'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { getPreparedSpellLimit } from '@/lib/calculations/preparedSpellLimits'
import type { ClassPreparationRule } from '@/types/classCasting'
import { CORE_RULES_METADATA } from './rulesetMetadata'

type Row = Record<string, unknown>
const rules = Object.values(CORE_RULES_METADATA)
const levels = Math.max(...rules.map((rule) => rule.maxCharacterLevel))
const minimumModifier = getAbilityModifier(
  Math.min(...rules.map((rule) => rule.abilityScoreMinimum)),
)
const maximumModifier = getAbilityModifier(
  Math.max(...rules.map((rule) => rule.abilityScoreAbsoluteMaximum)),
)
const schedule = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === levels &&
  value.every((count) => Number.isSafeInteger(count) && count >= 0)

/**
 * Generation-only grammar for the preparation floor missing from structured preparedSpells.
 * Read one exact declaration's entries, without joining adjacent prose or guessing class names.
 */
export function getDeclaredPreparationMinimum(entries: unknown): number | undefined {
  const strings: string[] = []
  const visit = (value: unknown) => {
    if (typeof value === 'string') strings.push(value)
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      const row = value as Row
      for (const key of ['entries', 'items', 'entry']) visit(row[key])
    }
  }
  visit(entries)
  const clauses = strings.filter(
    (value) =>
      /\bprepare\b/i.test(value) &&
      /\b(?:choose|choosing) a number\b/i.test(value) &&
      /\bequal to\b/i.test(value) &&
      /\bminimum\b/i.test(value),
  )
  return clauses.length === 1 &&
    /\b(?:choose|choosing) a number\b.*\bequal to\b.*\(minimum of (?:one|1) spell\)/i.test(
      clauses[0],
    )
    ? 1
    : undefined
}

/** Supported structured preparation shapes, independent of class/feature/source names. */
export function deriveClassPreparationRule(
  row: Row,
  declaredMinimum?: number,
): ClassPreparationRule | undefined {
  const ability =
    typeof row.spellcastingAbility === 'string' && toAbilityName(row.spellcastingAbility)
  if (!ability) return undefined
  if (row.preparedSpells !== undefined && typeof row.preparedSpells !== 'string') return undefined
  const formula = typeof row.preparedSpells === 'string' ? row.preparedSpells : undefined
  const progression = row.preparedSpellsProgression
  if (!formula && progression === undefined) return undefined
  if (formula && progression !== undefined) return undefined
  if (row.spellsKnownProgression !== undefined) return undefined
  if (row.spellsKnownProgressionFixed !== undefined && !schedule(row.spellsKnownProgressionFixed))
    return undefined
  const spellbook = row.spellsKnownProgressionFixed !== undefined
  if (
    (row.preparedSpellsChange !== undefined &&
      row.preparedSpellsChange !== 'level' &&
      row.preparedSpellsChange !== 'restLong') ||
    (spellbook && row.preparedSpellsChange === 'level')
  )
    return undefined
  const mode = spellbook
    ? 'spellbook'
    : row.preparedSpellsChange === 'level'
      ? 'level'
      : row.preparedSpellsChange === 'restLong'
        ? 'daily'
        : undefined
  if (!mode || (formula && mode === 'level')) return undefined
  let capacity: ClassPreparationRule['capacity']
  if (formula) {
    if (declaredMinimum !== 1) return undefined
    const variables = [...formula.matchAll(/<\$([^$]+)\$>/g)].map((match) => match[1])
    const abilityVariable = toAbilityAbbrev(ability) + '_mod'
    if (variables.some((variable) => variable !== 'level' && variable !== abilityVariable))
      return undefined
    capacity = { kind: 'formula', formula, minimum: declaredMinimum }
  } else {
    if (!schedule(progression)) return undefined
    capacity = { kind: 'progression', values: [...progression] }
  }
  const maximumByLevel: number[] = []
  for (let level = 1; level <= levels; level++) {
    let maximum = 0
    for (let modifier = minimumModifier; modifier <= maximumModifier; modifier++) {
      const result = getPreparedSpellLimit(
        {
          spellcastingAbility: row.spellcastingAbility as string,
          ...(capacity.kind === 'formula'
            ? { preparedSpells: capacity.formula }
            : { preparedSpellsProgression: [...capacity.values] }),
        },
        level,
        modifier,
      )
      if (result === null || !Number.isSafeInteger(result)) return undefined
      maximum = Math.max(maximum, result, capacity.kind === 'formula' ? capacity.minimum : 0)
    }
    maximumByLevel.push(maximum)
  }
  return { mode, ability: row.spellcastingAbility as string, capacity, maximumByLevel }
}
