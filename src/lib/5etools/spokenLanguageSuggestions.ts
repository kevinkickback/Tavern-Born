import type { Creature5e, Language5e, Race5e } from '@/types/5etools'
import { canonicalProficiencyName } from './classProficiencyIdentity'

export interface SpokenLanguageSuggestions {
  byCreatureType: ReadonlyMap<string, readonly string[]>
  byRace: ReadonlyMap<string, readonly string[]>
  races: readonly Pick<Race5e, 'name' | 'source'>[]
}

export function getSpokenLanguageSuggestions(
  index: SpokenLanguageSuggestions | undefined,
  query: { creatureType?: string; races?: readonly string[] },
): string[] {
  if (!index) return []
  const values = query.creatureType
    ? (index.byCreatureType.get(query.creatureType.trim().toLowerCase()) ?? [])
    : (query.races ?? []).flatMap((race) => index.byRace.get(race.trim().toLowerCase()) ?? [])
  return [...new Set(values)].sort()
}

/** Positive suggestions only: neither search tags nor absent records prove spoken-language eligibility. */
export function buildSpokenLanguageSuggestions(
  creatures: readonly Creature5e[],
  races: readonly Race5e[],
  languages: readonly Language5e[],
): SpokenLanguageSuggestions {
  const vocabulary = new Set(languages.flatMap((l) => canonicalProficiencyName(l.name) ?? []))
  const byCreatureType = new Map<string, Set<string>>()
  const byRace = new Map<string, Set<string>>()
  const add = (index: Map<string, Set<string>>, key: string, name: string) => {
    const canonical = canonicalProficiencyName(name)
    if (!canonical || !vocabulary.has(canonical)) return
    const values = index.get(key) ?? new Set<string>()
    values.add(canonical)
    index.set(key, values)
  }
  for (const creature of creatures) {
    if (creature._copy) continue
    const type = typeof creature.type === 'string' ? creature.type : creature.type?.type
    const key = type && canonicalProficiencyName(type)
    if (!key) continue
    for (const language of creature.languages ?? []) {
      // Exact bare vocabulary names exclude comprehension, telepathy and unresolved prose.
      if (typeof language === 'string') add(byCreatureType, key, language)
    }
  }
  const suggestions = new Map<string, Pick<Race5e, 'name' | 'source'>>()
  for (const race of races) {
    if (race._copy) continue
    const types = race.creatureTypes
    if (Array.isArray(types) && types.length && !types.includes('humanoid')) continue
    const key = canonicalProficiencyName(race.name)
    if (!key) continue
    suggestions.set(JSON.stringify([key, race.source]), { name: race.name, source: race.source })
    for (const declaration of race.languageProficiencies ?? []) {
      for (const [language, value] of Object.entries(declaration)) {
        if (value === true) add(byRace, key, language)
      }
    }
  }
  const sorted = (index: Map<string, Set<string>>) =>
    new Map([...index].map(([key, values]) => [key, [...values].sort()]))
  return {
    byCreatureType: sorted(byCreatureType),
    byRace: sorted(byRace),
    races: [...suggestions.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
    ),
  }
}
