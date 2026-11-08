import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import { parseFilterTags } from './choiceFilterTags'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export function readArtificerInfusionPlans(feature: OptionalFeatureLike, gain: number) {
  if (
    norm(feature.name) !== 'replicate magic item' ||
    !feature.featureType?.includes('AI') ||
    ('sourceIdentityConflict' in feature && feature.sourceIdentityConflict) ||
    !Array.isArray(feature.entries)
  )
    return undefined
  const [clause, legend, ...tables] = feature.entries
  if (
    typeof clause !== 'string' ||
    !clause.startsWith(
      'Using this infusion, you replicate a particular magic item. You can learn this infusion multiple times; each time you do so, choose a magic item that you can make with it, picking from the Replicable Items tables below.',
    ) ||
    typeof legend !== 'string' ||
    !tables.length
  )
    return undefined
  const [alternate, ...otherFilters] = parseFilterTags(clause)
  if (!alternate || otherFilters.length || alternate.filter.entityType !== 'item') return undefined
  const earliest = new Map<string, NormalizedChoiceOptionReference>()
  const levels = new Set<number>()
  for (const value of tables) {
    const table = record(value)
    const tier =
      typeof table.caption === 'string' &&
      /^Replicable Items \((\d+)(?:st|nd|rd|th)-Level Artificer\)$/.exec(table.caption)
    const level = tier ? Number(tier[1]) : 0
    if (
      table.type !== 'table' ||
      level < gain ||
      level > 20 ||
      levels.has(level) ||
      JSON.stringify(table.colLabels) !== '["Magic Item","Attunement"]' ||
      !Array.isArray(table.rows) ||
      !table.rows.length
    )
      return undefined
    levels.add(level)
    for (const row of table.rows) {
      const tag =
        Array.isArray(row) &&
        typeof row[0] === 'string' &&
        /^\{@item ([^{}|]+)(?:\|([^{}|]*))?(?:\|[^{}|]+)?\}(?: \(detailed in \{@book [^{}|]+\|[^{}|]+\|\d+\}\))?$/.exec(
          row[0],
        )
      if (!tag || row.length !== 2 || !['Yes', 'No'].includes(row[1])) return undefined
      const [, name, printing] = tag
      const source = printing || 'DMG'
      const key = JSON.stringify([norm(name), norm(source)])
      if ((earliest.get(key)?.minimumClassLevel ?? Infinity) > level)
        earliest.set(key, { entityType: 'item', name, source, minimumClassLevel: level })
    }
  }
  return levels.has(gain)
    ? { options: [...earliest.values()], alternate: alternate.filter }
    : undefined
}
