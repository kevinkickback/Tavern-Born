import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Item5e, OptionalFeatureLike, Raw5ePrereq } from '@/types/5etools'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { createExactPlanItemLookup } from './artificerArmorReplication'
import { parseFilterTags } from './choiceFilterTags'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export function isArtificerInfusionChoice(choice: Partial<NormalizedCharacterChoice>) {
  const types = choice.optionFilter?.featureTypes
  return (
    choice.source?.kind === 'optional-feature-progression' &&
    types?.length === 1 &&
    types[0] === 'AI'
  )
}

/** The optional feature's item clause describes its target, not a character prerequisite. */
export function getInfusionItemFacets(prerequisites?: Raw5ePrereq[]) {
  const clauses = prerequisites?.flatMap((row) => (Array.isArray(row.item) ? row.item : [])) ?? []
  if (!clauses.length || clauses.some((clause) => typeof clause !== 'string' || !clause.trim()))
    return undefined
  const types = new Set<string>()
  const attunement = new Set<string>()
  // 5etools declares standard infusion targets in prose, including alternatives and a suffix.
  for (const clause of clauses as string[]) {
    const target = clause.toLowerCase().trim()
    attunement.add(target.endsWith(' (requires attunement)') ? 'required' : 'none')
    for (const type of target.match(/\b(weapon|armor|shield|ring|robes)\b/g) ?? ['robes'])
      types.add(type === 'robes' ? 'other' : type)
  }
  return { types: [...types], attunement: [...attunement] }
}

export function createArtificerPlanFacets(
  items: readonly Item5e[],
  itemTypes: Readonly<Record<string, string>>,
) {
  const resolve = createExactPlanItemLookup(items)
  const classify = (input: Parameters<typeof getNormalizedItemTraits>[0]) => {
    const traits = getNormalizedItemTraits(input, itemTypes)
    return [
      ...(traits.isWeapon ? ['weapon'] : []),
      ...(traits.armorCategory === 'shield' ? ['shield'] : traits.isArmor ? ['armor'] : []),
      ...(traits.typeCodes.includes('RG') ? ['ring'] : []),
    ]
  }
  const typesFor = (item: Item5e, depth = 0): string[] => {
    const direct = classify(item)
    if (direct.length || depth >= 8) return direct
    if (item.magicVariantReference && Array.isArray(item.requires)) {
      return item.requires.flatMap((value) => {
        const rule = record(value)
        const base =
          typeof rule.name === 'string' && typeof rule.source === 'string'
            ? resolve(rule.name, rule.source)
            : undefined
        return classify(
          base ?? {
            type: typeof rule.type === 'string' ? rule.type : undefined,
            weaponCategory:
              typeof rule.weaponCategory === 'string' ? rule.weaponCategory : undefined,
            weapon: rule.weapon === true,
            armor: rule.armor === true,
          },
        )
      })
    }
    return (Array.isArray(item.items) ? item.items : []).flatMap((value) => {
      const [name, source, ...extra] = typeof value === 'string' ? value.split('|') : []
      const child = name && source && !extra.length ? resolve(name, source) : undefined
      return child ? typesFor(child, depth + 1) : []
    })
  }
  return ({ name, source }: NormalizedChoiceOptionReference) => {
    const item = source && resolve(name, source)
    if (!item) return undefined
    const types = [...new Set(typesFor(item))]
    return {
      types: types.length ? types : ['other'],
      // As in 5etools Renderer.item, optional attunement is distinct from a requirement.
      attunement: [item.reqAttune && item.reqAttune !== 'optional' ? 'required' : 'none'],
    }
  }
}

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
