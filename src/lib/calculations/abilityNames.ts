import { ABILITY_CATALOG_FALLBACK } from '@/lib/5etools/rulesetMetadata'
import type { AbilityName } from '@/types/character'

export const ABILITY_ABBREV_TO_FULL: Readonly<Record<string, AbilityName>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.abbreviation, ability.name]),
)

export const ABILITY_ABBREV_ORDER = ABILITY_CATALOG_FALLBACK.map((ability) => ability.abbreviation)

export const ABILITY_ABBREV_TO_TITLE: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.abbreviation, ability.title]),
)

export const ABILITY_FULL_TO_ABBREV: Readonly<Record<string, string>> = Object.fromEntries(
  ABILITY_CATALOG_FALLBACK.map((ability) => [ability.name, ability.abbreviation]),
)

function findAbility(key: string) {
  const lower = key.toLowerCase()
  return ABILITY_CATALOG_FALLBACK.find(({ abbreviation, name }) => {
    return abbreviation === lower || name === lower
  })
}

export function toAbilityAbbrev(key: string): string | null {
  return findAbility(key)?.abbreviation ?? null
}

export function toAbilityName(key: string): AbilityName | null {
  return findAbility(key.trim())?.name ?? null
}
