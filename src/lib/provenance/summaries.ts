import { stripItemTag, toDisplayName } from './normalization'
import type {
  ProficiencyProvenance,
  ProvenanceLedger,
  SourceRow,
  SourceTag,
  SourceType,
} from './types'

function formatSourceType(type: SourceType): string {
  switch (type) {
    case 'optionalFeature':
      return 'optional feature'
    default:
      return type
  }
}

function getSourceTypes(tags: SourceTag[]): SourceType[] {
  return Array.from(new Set(tags.map((t) => t.sourceType)))
}

function formatTags(tags: SourceTag[]): string {
  if (tags.length === 0) return 'Unknown Source'
  return getSourceTypes(tags).map(formatSourceType).join(', ')
}

function formatAbilityBonusAttribution(tag: SourceTag): string {
  if (
    tag.label.toLowerCase() === 'asi' ||
    tag.sourceName.toLowerCase() === 'ability score improvement'
  ) {
    return 'ASI'
  }
  return formatSourceType(tag.sourceType)
}

/** Strip trailing parentheticals that are pure flavor text (inner text > 30 chars). */
function trimFlavorParenthetical(name: string): string {
  return name.replace(/\s*\([^)]{31,}\)$/, '')
}

function rowsFromMap(map: Record<string, SourceTag[]>, category: string): SourceRow[] {
  return Object.entries(map).map(([key, tags]) => ({
    // Strip any stale {@item...} tags that may have been persisted before normalization
    itemName: trimFlavorParenthetical(toDisplayName(stripItemTag(key))),
    category,
    attribution: formatTags(tags),
    sourceTypes: getSourceTypes(tags),
    isPending: false,
  }))
}

/** Derive all proficiency source rows for a single category. */
export function getProficiencySourceRows(
  ledger: ProvenanceLedger,
  category: keyof ProficiencyProvenance,
): SourceRow[] {
  const title = category === 'savingThrows' ? 'Saving Throws' : toDisplayName(category)
  return rowsFromMap(ledger.proficiencies[category], title)
}

/** Derive source rows for all proficiency categories merged with pending choice rows. */
export function getAllProficiencyRows(ledger: ProvenanceLedger): {
  skills: SourceRow[]
  savingThrows: SourceRow[]
  armor: SourceRow[]
  weapons: SourceRow[]
  tools: SourceRow[]
  languages: SourceRow[]
  pendingChoices: SourceRow[]
} {
  const proficiencyDomains: Array<keyof ProficiencyProvenance> = [
    'skills',
    'savingThrows',
    'armor',
    'weapons',
    'tools',
    'languages',
  ]

  const pendingChoices: SourceRow[] = ledger.choices
    .filter(
      (c) =>
        proficiencyDomains.includes(c.domain as keyof ProficiencyProvenance) &&
        (c.status === 'pending' || c.status === 'partially-resolved'),
    )
    .map((c) => {
      const source = formatSourceType(c.sourceTag.sourceType)
      const domain = c.domain.charAt(0).toUpperCase() + c.domain.slice(1)
      const remaining = c.chooseCount - c.selected.length
      const pool = c.optionPool.length > 0 ? ` from ${c.sourceTag.sourceName} options` : ''
      const label =
        c.status === 'partially-resolved'
          ? `choose ${remaining} more ${domain}${pool}`
          : `choose ${c.chooseCount} ${domain}${pool}`
      return {
        itemName: label,
        category: domain,
        attribution: source,
        sourceTypes: [c.sourceTag.sourceType],
        isPending: true,
      }
    })

  return {
    skills: rowsFromMap(ledger.proficiencies.skills, 'Skills'),
    savingThrows: rowsFromMap(ledger.proficiencies.savingThrows, 'Saving Throws'),
    armor: rowsFromMap(ledger.proficiencies.armor, 'Armor'),
    weapons: rowsFromMap(ledger.proficiencies.weapons, 'Weapons'),
    tools: rowsFromMap(ledger.proficiencies.tools, 'Tools'),
    languages: rowsFromMap(ledger.proficiencies.languages, 'Languages'),
    pendingChoices,
  }
}

/** Derive ability bonus source rows for display. */
export function getAbilityBonusRows(ledger: ProvenanceLedger): SourceRow[] {
  // Fixed and directly-applied bonuses (race fixed ASIs, background ASIs, ASI class features).
  const fixedRows: SourceRow[] = ledger.abilityBonuses.map((r) => ({
    itemName: `${r.ability.toUpperCase().slice(0, 3)} +${r.value}`,
    category: 'Ability Bonuses',
    attribution: formatAbilityBonusAttribution(r.sourceTag),
    sourceTypes: [r.sourceTag.sourceType],
    isPending: false,
  }))

  // Choice-based ASI bonuses. ChoiceRecord.selected is populated by
  // resolveRaceAsiChoicesInLedger before rows are derived.
  const choiceRows: SourceRow[] = ledger.choices
    .filter((c) => c.domain === 'abilityBonuses')
    .flatMap((c) => {
      const source = formatSourceType(c.sourceTag.sourceType)
      const pool =
        c.optionPool.length > 0
          ? ` from ${c.optionPool.map((a) => a.toUpperCase().slice(0, 3)).join('/')}`
          : ''

      if (c.status === 'resolved') {
        return c.selected.map((ab) => ({
          itemName: `${ab.toUpperCase().slice(0, 3)} +${c.amount ?? 1}`,
          category: 'Ability Bonuses',
          attribution: source,
          sourceTypes: [c.sourceTag.sourceType],
          isPending: false,
        }))
      }

      if (c.status === 'partially-resolved') {
        const resolvedRows: SourceRow[] = c.selected.map((ab) => ({
          itemName: `${ab.toUpperCase().slice(0, 3)} +${c.amount ?? 1}`,
          category: 'Ability Bonuses',
          attribution: source,
          sourceTypes: [c.sourceTag.sourceType],
          isPending: false,
        }))
        const remaining = c.chooseCount - c.selected.length
        return [
          ...resolvedRows,
          {
            itemName: `choose ${remaining} more ability bonus${pool}`,
            category: 'Ability Bonuses',
            attribution: source,
            sourceTypes: [c.sourceTag.sourceType],
            isPending: true,
          },
        ]
      }

      // pending
      return [
        {
          itemName: `choose ${c.chooseCount} ability bonus${pool}`,
          category: 'Ability Bonuses',
          attribution: source,
          sourceTypes: [c.sourceTag.sourceType],
          isPending: true,
        },
      ]
    })

  return [...fixedRows, ...choiceRows]
}

/** Derive feat source rows. */
export function getFeatRows(ledger: ProvenanceLedger): SourceRow[] {
  return rowsFromMap(ledger.feats, 'Feats')
}

/** Derive feature (optional features) source rows. */
export function getFeatureRows(ledger: ProvenanceLedger): SourceRow[] {
  return rowsFromMap(ledger.features, 'Features')
}

/** Derive spell source rows. */
export function getSpellRows(ledger: ProvenanceLedger): SourceRow[] {
  const rows = rowsFromMap(ledger.spells, 'Spells')
  const pending = ledger.choices
    .filter(
      (c) => c.domain === 'spells' && (c.status === 'pending' || c.status === 'partially-resolved'),
    )
    .map((c) => {
      const source = formatSourceType(c.sourceTag.sourceType)
      const pool = c.optionPool.length > 0 ? ` (${c.optionPool.join(', ')})` : ''
      return {
        itemName: `choose ${c.chooseCount} spells${pool}`,
        category: 'Spells',
        attribution: source,
        sourceTypes: [c.sourceTag.sourceType],
        isPending: true,
      }
    })
  return [...rows, ...pending]
}

/** Derive equipment source rows. */
export function getEquipmentRows(ledger: ProvenanceLedger): SourceRow[] {
  return rowsFromMap(ledger.equipment, 'Equipment')
}

/** Flatten all source rows across all domains for a generic sources panel. */
export function getAllSourceRows(ledger: ProvenanceLedger): SourceRow[] {
  return [
    ...getAbilityBonusRows(ledger),
    ...rowsFromMap(ledger.proficiencies.skills, 'Skills'),
    ...rowsFromMap(ledger.proficiencies.savingThrows, 'Saving Throws'),
    ...rowsFromMap(ledger.proficiencies.armor, 'Armor'),
    ...rowsFromMap(ledger.proficiencies.weapons, 'Weapons'),
    ...rowsFromMap(ledger.proficiencies.tools, 'Tools'),
    ...rowsFromMap(ledger.proficiencies.languages, 'Languages'),
    ...rowsFromMap(ledger.features, 'Features'),
    ...rowsFromMap(ledger.feats, 'Feats'),
    ...rowsFromMap(ledger.spells, 'Spells'),
    ...rowsFromMap(ledger.equipment, 'Equipment'),
    // Pending choices last
    ...ledger.choices
      .filter((c) => c.status !== 'resolved')
      .map((c) => ({
        itemName: `choose ${c.chooseCount} ${c.domain}`,
        category: toDisplayName(c.domain),
        attribution: formatSourceType(c.sourceTag.sourceType),
        sourceTypes: [c.sourceTag.sourceType],
        isPending: true,
      })),
  ]
}
