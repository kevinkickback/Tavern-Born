import { getRaceSpellChoiceKey } from '@/lib/5etools/raceSpellIdentity'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { RaceSpellChoice, SpellProfile } from '@/types/character'
import { getSpellNameKey, getSpellReferenceKey, parseSpellReference } from './spellIdentity'
import { isSpellOnClassList } from './spellUtils'

export interface NativeSpellLookups {
  spellsByKey?: Readonly<Record<string, Spell5e>>
  rawSpellsByKey?: Readonly<Record<string, Spell5e>>
}

const semantics = (choice: RaceSpellChoice) =>
  getRaceSpellChoiceKey({ ...choice, level: choice.level ?? -1 })
const scope = (choice: RaceSpellChoice) =>
  JSON.stringify([
    choice.level,
    choice.isCantrip,
    choice.source,
    choice.usage,
    choice.dailyUses ?? null,
  ])
const filterKey = (filter: RaceSpellChoice['filter']) =>
  filter
    ? JSON.stringify([
        filter.level,
        [...new Set(filter.classes.map((name) => name.trim().toLowerCase()))].sort(),
      ])
    : undefined

/** Correspondence uses typed applied rules, never ordinals or rules decoded from saved IDs. */
export function matchNativeRacialChoices(
  previous: SpellProfile | undefined,
  mode: 'mandatory' | 'alternative',
  suiteId: string | undefined,
  choices: readonly RaceSpellChoice[],
): Map<string, RaceSpellChoice> {
  const matches = new Map<string, RaceSpellChoice>()
  if (
    !suiteId ||
    !previous?.racial?.suite ||
    (previous.racial.suite.id !== suiteId &&
      (previous.racial.mode !== 'mandatory' || mode !== 'mandatory'))
  )
    return matches
  const old = previous.choices ?? []
  const used = new Set<RaceSpellChoice>()
  for (const choice of choices) {
    const key = semantics(choice)
    const candidates = old.filter((entry) => semantics(entry) === key)
    if (
      candidates.length === 1 &&
      choices.filter((entry) => semantics(entry) === key).length === 1
    ) {
      matches.set(choice.id, candidates[0])
      used.add(candidates[0])
    }
  }
  for (const choice of choices) {
    if (matches.has(choice.id)) continue
    const key = scope(choice)
    const candidates = old.filter((entry) => !used.has(entry) && scope(entry) === key)
    const remaining = choices.filter((entry) => !matches.has(entry.id) && scope(entry) === key)
    if (candidates.length === 1 && remaining.length === 1) {
      matches.set(choice.id, candidates[0])
      used.add(candidates[0])
    }
  }
  return matches
}

/** Undefined means the requested exact printing is unavailable, including a poisoned lookup key. */
export function matchesNativeSpellFilter(
  reference: string,
  filter: NonNullable<RaceSpellChoice['filter']>,
  lookups?: NativeSpellLookups,
): boolean | undefined {
  const target = parseSpellReference(reference)
  const exact = (lookup: NativeSpellLookups['spellsByKey']) => {
    const spell = lookup && resolveSpellReference(reference, lookup)
    return spell &&
      normalizeOwnerIdentity(spell.name) === normalizeOwnerIdentity(target.name) &&
      normalizeOwnerIdentity(spell.source) === normalizeOwnerIdentity(target.source)
      ? spell
      : undefined
  }
  const spell = exact(lookups?.spellsByKey) ?? exact(lookups?.rawSpellsByKey)
  return spell
    ? spell.level === filter.level &&
        (!filter.classes.length || filter.classes.some((name) => isSpellOnClassList(spell, name)))
    : undefined
}

export function retainNativeSpellChoices(
  previous: RaceSpellChoice | undefined,
  current: RaceSpellChoice,
  lookups?: NativeSpellLookups,
): string[] {
  const pool =
    current.pool && new Set(current.pool.map((reference) => getSpellReferenceKey(reference)))
  const seen = new Set<string>()
  return (previous?.selected ?? [])
    .filter((reference) => {
      const name = getSpellNameKey(reference)
      if (seen.has(name) || (pool && !pool.has(getSpellReferenceKey(reference)))) return false
      if (current.filter) {
        const allowed = matchesNativeSpellFilter(reference, current.filter, lookups)
        if (
          allowed === false ||
          (allowed === undefined && filterKey(previous?.filter) !== filterKey(current.filter))
        )
          return false
      }
      seen.add(name)
      return true
    })
    .slice(0, current.count)
}

/** Strict admission may reorder keys or omit undefined fields without changing the relation. */
export function nativeSpellDataKey(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
        )
      : entry,
  )
}
