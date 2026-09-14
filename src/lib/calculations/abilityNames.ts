import { ABILITY_CATALOG_FALLBACK } from '@/lib/5etools/rulesetMetadata'

export const ABILITY_ABBREV_TO_FULL: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.abbreviation, ability.name]),
)

export const ABILITY_ABBREV_ORDER = ABILITY_CATALOG_FALLBACK.map((ability) => ability.abbreviation)

export const ABILITY_ABBREV_TO_TITLE: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.abbreviation, ability.title]),
)

export const ABILITY_FULL_TO_ABBREV: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.name, ability.abbreviation]),
)

export function toAbilityAbbrev(key: string): string | null {
  const lower = key.toLowerCase()
  if (ABILITY_ABBREV_TO_TITLE[lower]) return lower
  const fromFull = Object.entries(ABILITY_ABBREV_TO_FULL).find(([, full]) => full === lower)
  return fromFull?.[0] ?? null
}

export function toAbilityName(key: string): string | null {
  const abbreviation = toAbilityAbbrev(key.trim())
  return abbreviation ? (ABILITY_ABBREV_TO_FULL[abbreviation] ?? null) : null
}
