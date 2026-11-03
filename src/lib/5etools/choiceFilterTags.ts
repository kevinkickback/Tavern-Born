import type { ChoiceOptionEntityType, NormalizedChoiceOptionFilter } from '@/types/classRules'
export interface ParsedFilterTag {
  label: string
  entityType: ChoiceOptionEntityType
  filter: NormalizedChoiceOptionFilter
  /** Starting-equipment policy cannot silently discard an unimplemented source constraint. */
  unsupportedClauses?: string[]
}

function parseFraction(value: string): number | undefined {
  const cleaned = value.replace(/[[\]&]/g, '').trim()
  const fraction = /^(\d+)\/(\d+)$/.exec(cleaned)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    return denominator > 0 ? numerator / denominator : undefined
  }
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : undefined
}

function parseChallengeRatingMaximum(values: readonly string[]): number | undefined {
  const ratings = values.flatMap((value) =>
    value
      .split(/[;&]/)
      .map(parseFraction)
      .filter((rating): rating is number => rating !== undefined),
  )
  return ratings.length > 0 ? Math.max(...ratings) : undefined
}

export function parseFilterTags(text: string): ParsedFilterTag[] {
  const tags: ParsedFilterTag[] = []
  const regex = /\{@filter\s+([^|}]+)\|([^|}]+)\|([^}]+)}/gi
  for (const match of text.matchAll(regex)) {
    const label = match[1]?.trim() ?? ''
    const collection = match[2]?.trim().toLowerCase()
    const clauses = (match[3] ?? '').split('|').flatMap((clause) => clause.split(/;(?=[^;=]+=)/))
    const entityType =
      collection === 'feats'
        ? 'feat'
        : collection === 'items'
          ? 'item'
          : collection === 'optionalfeatures'
            ? 'optionalFeature'
            : collection === 'bestiary'
              ? 'creature'
              : undefined
    if (!entityType) continue

    const filter: NormalizedChoiceOptionFilter = { entityType }
    const unsupportedClauses: string[] = []
    const seenClauses = new Map<string, string>()
    for (const clause of clauses) {
      const separator = clause.indexOf('=')
      if (separator < 0) {
        unsupportedClauses.push(clause)
        continue
      }
      const key = clause.slice(0, separator).trim().toLowerCase()
      const values = clause
        .slice(separator + 1)
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean)
      if (!values.length) {
        unsupportedClauses.push(clause)
        continue
      }
      const signature = values
        .map((value) => value.toLowerCase())
        .sort()
        .join(';')
      if (seenClauses.has(key) && seenClauses.get(key) !== signature)
        unsupportedClauses.push(clause)
      seenClauses.set(key, signature)
      if (key === 'category') filter.categories = values
      else if (key === 'feature type') filter.featureTypes = values
      else if (key === 'challenge rating') {
        filter.challengeRatingMaximum = parseChallengeRatingMaximum(values)
      } else if (filter.entityType === 'creature' && key === 'type') {
        filter.creatureTypes = values.filter((value) => !value.startsWith('!'))
      } else if (filter.entityType === 'creature' && key === 'size') {
        filter.sizes = values.filter((value) => !value.startsWith('!'))
      } else if (key === 'type') {
        const included = values.filter((value) => !value.startsWith('!'))
        const excluded = values
          .filter((value) => value.startsWith('!'))
          .map((value) => value.slice(1))
        if (included.length > 0) filter.itemTypes = included
        if (excluded.length > 0) filter.excludedItemTypes = excluded
      } else if (filter.entityType === 'item' && key === 'property') {
        if (values.some((value) => !value.startsWith('!'))) unsupportedClauses.push(clause)
        filter.excludedItemProperties = values
          .filter((value) => value.startsWith('!'))
          .map((value) => value.slice(1))
      } else if (key === 'rarity') filter.rarities = values
      else if (key === 'miscellaneous') {
        if (values.includes('mundane')) filter.mundane = true
        if (values.includes('!cursed')) filter.excludeCursed = true
        if (values.includes('!swarm')) filter.excludeSwarms = true
        if (values.some((value) => !['mundane', '!cursed', '!swarm'].includes(value)))
          unsupportedClauses.push(clause)
      } else if (key === 'melee weapon') {
        if (values.length !== 1 || values[0] !== 'sand') unsupportedClauses.push(clause)
        filter.weaponRanges = [...new Set([...(filter.weaponRanges ?? []), 'melee' as const])]
      } else if (key === 'ranged weapon') {
        if (values.length !== 1 || values[0] !== 'sand') unsupportedClauses.push(clause)
        filter.weaponRanges = [...new Set([...(filter.weaponRanges ?? []), 'ranged' as const])]
      } else if (key === 'source' && values.length === 1 && !values[0].startsWith('!'))
        filter.source = values[0]
      else unsupportedClauses.push(clause)
    }
    tags.push({
      label,
      entityType,
      filter,
      ...(unsupportedClauses.length ? { unsupportedClauses } : {}),
    })
  }
  return tags
}
