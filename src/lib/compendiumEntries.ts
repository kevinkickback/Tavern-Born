import type {
  Background5e,
  Class5e,
  Creature5e,
  Feat5e,
  Item5e,
  ItemMastery5e,
  ItemProperty5e,
  ItemType5e,
  Organization5e,
  Race5e,
  Spell5e,
  SubclassFeature,
} from '@/types/5etools'

interface CompendiumEntryBase {
  id: string
  name: string
  source: string
  description?: string
  context?: string
  searchText?: string
}

type UntypedEntryType =
  | 'Skill'
  | 'Sense'
  | 'Action'
  | 'Condition'
  | 'Language'
  | 'Deity'
  | 'Organization'
  | 'Item Property'
  | 'Weapon Mastery'
  | 'Optional Feature'
  | 'Variant Rule'
  | 'Trap / Hazard'
  | 'Reward'
  | 'Cult / Boon'

export type CompendiumEntry =
  | (CompendiumEntryBase & { type: 'Race'; data: Race5e })
  | (CompendiumEntryBase & { type: 'Class'; data: Class5e })
  | (CompendiumEntryBase & { type: 'Spell'; data: Spell5e })
  | (CompendiumEntryBase & { type: 'Item'; data: Item5e })
  | (CompendiumEntryBase & { type: 'Background'; data: Background5e })
  | (CompendiumEntryBase & { type: 'Feat'; data: Feat5e })
  | (CompendiumEntryBase & { type: 'Creature'; data: Creature5e })
  | (CompendiumEntryBase & { type: 'Subclass Feature'; data: SubclassFeature })
  | (CompendiumEntryBase & { type: UntypedEntryType; data: Record<string, unknown> })

export type CompendiumEditionFilter = '5e' | '5.5e' | 'both'

const REVISED_CORE_SOURCES = new Set(['XPHB', 'XDMG', 'XMM'])

interface CompendiumGameData {
  races?: Race5e[] | Record<string, Race5e>
  classes?: Class5e[] | Record<string, Class5e>
  spells?: Spell5e[] | Record<string, Spell5e>
  items?: Item5e[]
  itemsBase?: Item5e[]
  itemProperties?: ItemProperty5e[]
  itemTypes?: ItemType5e[]
  itemMasteries?: ItemMastery5e[]
  backgrounds?: Background5e[] | Record<string, Background5e>
  organizations?: Organization5e[]
  feats?: Feat5e[] | Record<string, Feat5e>
  creatures?: Creature5e[]
  /** Present on GameData, but intentionally excluded from the curated reference index. */
  classFeatures?: unknown[]
  skills?: unknown
  senses?: unknown[]
  actions?: unknown[]
  conditions?: unknown[]
  languages?: unknown
  deities?: unknown[]
  optionalfeatures?: unknown[]
  variantrules?: unknown[]
  trapHazards?: unknown[]
  rewards?: unknown[]
  cultsBoons?: unknown[]
}

function asObj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asCollection<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'object' && value !== null) {
    return Object.values(value) as T[]
  }
  return []
}

function normalizeSearchText(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function toPreviewPlainText(value: string): string {
  return value
    .replace(/\{#itemEntry [^}]+\}/g, '')
    .replace(/\{@([a-zA-Z]+)(?:\s+([^}]*))?\}/g, (_match, tag: string, content = '') => {
      const primaryText = content.split('|')[0]?.trim() ?? ''
      if (tag === 'h') return 'Hit:'
      if (tag === 'hit') return primaryText ? `+${primaryText}` : ''
      if (tag === 'dc') return primaryText ? `DC ${primaryText}` : ''
      if (tag === 'chance') return primaryText ? `${primaryText}%` : ''
      if (tag === 'recharge') return `(Recharge ${primaryText || '5'}-6)`
      return primaryText
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function isInternalReference(value: string): boolean {
  const trimmed = value.trim()
  return /^\{#[^}]+\}$/.test(trimmed) || /^[^|]+\|[A-Z][A-Z0-9-]*$/.test(trimmed)
}

function collectPreviewText(value: unknown, output: string[], depth = 0): void {
  if (value == null || depth > 6 || output.length >= 4) return

  if (typeof value === 'string') {
    if (isInternalReference(value)) return
    if (value.trim()) output.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPreviewText(item, output, depth + 1)
      if (output.length >= 4) return
    }
    return
  }

  if (typeof value === 'object' && value !== null) {
    const entry = value as {
      entries?: unknown[]
      entry?: unknown
      items?: unknown[]
      description?: unknown
    }
    collectPreviewText(entry.entries, output, depth + 1)
    collectPreviewText(entry.entry, output, depth + 1)
    collectPreviewText(entry.items, output, depth + 1)
    collectPreviewText(entry.description, output, depth + 1)
  }
}

function getPreviewDescription(value: unknown): string {
  const rawCandidates: string[] = []
  collectPreviewText(value, rawCandidates)
  const candidates = rawCandidates.map(toPreviewPlainText).filter(Boolean)
  const description = candidates.find((candidate) => candidate.length >= 40) ?? candidates[0] ?? ''
  if (description.length <= 220) return description
  const shortened = description.slice(0, 220)
  const lastSpace = shortened.lastIndexOf(' ')
  return `${shortened.slice(0, lastSpace > 40 ? lastSpace : 220).trim()}...`
}

function buildItemTypeNameMap(itemTypes: readonly ItemType5e[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const itemType of itemTypes) {
    const abbreviation = itemType.abbreviation?.trim()
    const source = itemType.source?.trim()
    const name = itemType.name?.trim()
    if (!abbreviation || !name) continue
    names.set(`${abbreviation}|${source ?? ''}`.toLowerCase(), name)
    if (!names.has(abbreviation.toLowerCase())) names.set(abbreviation.toLowerCase(), name)
  }
  return names
}

function getItemTypeName(item: Item5e, itemTypeNames: ReadonlyMap<string, string>): string {
  const rawType = item.type?.trim()
  if (!rawType) return ''
  const [abbreviation = '', source = ''] = rawType.split('|')
  return (
    itemTypeNames.get(`${abbreviation}|${source}`.toLowerCase()) ??
    itemTypeNames.get(abbreviation.toLowerCase()) ??
    rawType
  )
}

function getItemPropertyName(property: ItemProperty5e): string {
  const directName = typeof property.name === 'string' ? property.name.trim() : ''
  if (directName) return directName
  for (const entry of property.entries ?? []) {
    if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim()
  }
  return property.abbreviation
}

function buildEntry(
  name: string,
  type: string,
  source: string,
  description: string,
  data: Record<string, unknown>,
  metadata?: { context?: string; identity?: string; searchTerms?: string },
): CompendiumEntry {
  return {
    id: [type, source, name, metadata?.identity].filter(Boolean).join('|').toLowerCase(),
    name,
    type,
    source,
    description,
    ...(metadata?.context ? { context: metadata.context } : {}),
    searchText: normalizeSearchText(
      name,
      type,
      source,
      description,
      metadata?.context,
      metadata?.searchTerms,
    ),
    data,
  } as CompendiumEntry
}

function deduplicateEntries(entries: CompendiumEntry[]): CompendiumEntry[] {
  const uniqueEntries = new Map<string, CompendiumEntry>()
  for (const entry of entries) {
    if (!entry.name.trim()) continue
    if (!uniqueEntries.has(entry.id)) uniqueEntries.set(entry.id, entry)
  }
  return Array.from(uniqueEntries.values())
}

interface CollectedSubclassFeature {
  feature: SubclassFeature
  context: string
  identity: string
}

function collectSubclassFeatures(classes: readonly Class5e[]): CollectedSubclassFeature[] {
  const collected = new Map<string, CollectedSubclassFeature>()

  for (const classData of classes) {
    for (const subclass of classData.subclasses ?? []) {
      const traversedObjects = new WeakSet<object>()
      const fallback = {
        className: classData.name,
        classSource: classData.source,
        subclassName: subclass.name || subclass.shortName,
        subclassSource: subclass.source,
      }

      const visit = (feature: SubclassFeature | undefined) => {
        if (!feature?.name) return
        const className = feature.className || fallback.className
        const classSource = feature.classSource || fallback.classSource
        const subclassName = feature.subclassShortName || fallback.subclassName
        const subclassSource = feature.subclassSource || fallback.subclassSource
        const level = feature.level
        const identity = [className, classSource, subclassName, subclassSource, level ?? '']
          .join('|')
          .toLowerCase()
        const key = `${feature.name}|${feature.source}|${identity}`.toLowerCase()
        if (collected.has(key)) return

        const context = [
          className,
          subclassName,
          typeof level === 'number' ? `Level ${level}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ')
        collected.set(key, { feature, context, identity })

        const walk = (value: unknown) => {
          if (Array.isArray(value)) {
            value.forEach(walk)
            return
          }
          if (!value || typeof value !== 'object') return
          if (traversedObjects.has(value)) return
          traversedObjects.add(value)
          const record = value as Record<string, unknown>
          if (record.type === 'refSubclassFeature' && record.feature) {
            visit(record.feature as SubclassFeature)
          }
          Object.values(record).forEach(walk)
        }
        walk(feature.entries)
      }

      for (const feature of subclass.subclassFeatures ?? []) {
        if (typeof feature !== 'string') visit(feature)
      }
      for (const reference of subclass.subclassFeatureRefs ?? []) visit(reference.feature)
      for (const group of subclass.levelFeatures ?? []) group.features.forEach(visit)
    }
  }

  return [...collected.values()]
}

function getCreatureType(creature: Creature5e): string {
  return typeof creature.type === 'string' ? creature.type : (creature.type?.type ?? '')
}

function getCreatureChallengeRating(creature: Creature5e): string {
  const challengeRating =
    typeof creature.cr === 'object' && creature.cr !== null ? creature.cr.cr : creature.cr
  return challengeRating == null ? '' : String(challengeRating)
}

function getCreatureSummary(creature: Creature5e): string {
  const size = creature.size?.join('/') ?? ''
  const type = getCreatureType(creature)
  const challengeRating = getCreatureChallengeRating(creature)
  return [[size, type].filter(Boolean).join(' '), challengeRating ? `CR ${challengeRating}` : '']
    .filter(Boolean)
    .join(' · ')
}

function tokenizeSearchQuery(searchQuery: string): string[] {
  return searchQuery
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function matchesSearchTerm(entry: CompendiumEntry, term: string): boolean {
  return [entry.name, entry.type, entry.source, entry.description, entry.searchText]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(term))
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function scoreEntry(entry: CompendiumEntry, queryLower: string, terms: string[]): number {
  const nameLower = entry.name.toLowerCase()
  let score = 0

  if (nameLower === queryLower) return 200

  if (nameLower.startsWith(queryLower)) score += 80

  let nameMatches = 0
  for (const term of terms) {
    if (nameLower.includes(term)) {
      nameMatches++
      score += 10
      if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(nameLower)) score += 8
    }
  }

  if (nameMatches === terms.length) score += 20

  return score
}

export function buildCompendiumEntries(
  gameData: CompendiumGameData | null | undefined,
): CompendiumEntry[] {
  if (!gameData) return []

  const entries: CompendiumEntry[] = []

  if (gameData.races) {
    asCollection<Race5e>(gameData.races).forEach((race) => {
      const description = getPreviewDescription(race.entries ?? [])
      entries.push(
        buildEntry(
          race.name ?? '',
          'Race',
          race.source ?? 'Unknown',
          description,
          race as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  const classes = asCollection<Class5e>(gameData.classes)
  if (classes.length > 0) {
    classes.forEach((cls) => {
      const fluffEntries = Array.isArray(asObj(cls.fluff).entries)
        ? (asObj(cls.fluff).entries as unknown[])
        : []
      const classFluffEntries = Array.isArray(cls.fluffEntries) ? cls.fluffEntries : []
      const classFluffSections = Array.isArray(cls.classFluffSections) ? cls.classFluffSections : []
      const description =
        getPreviewDescription(classFluffEntries) ||
        getPreviewDescription(classFluffSections) ||
        getPreviewDescription(fluffEntries)
      entries.push(
        buildEntry(
          cls.name ?? '',
          'Class',
          cls.source ?? 'Unknown',
          description,
          cls as unknown as Record<string, unknown>,
        ),
      )
    })

    for (const { feature, context, identity } of collectSubclassFeatures(classes)) {
      const preview = getPreviewDescription(feature.entries ?? [])
      entries.push(
        buildEntry(
          feature.name,
          'Subclass Feature',
          feature.source || 'Unknown',
          [context, preview].filter(Boolean).join(' · '),
          feature as unknown as Record<string, unknown>,
          { context, identity },
        ),
      )
    }
  }

  if (gameData.spells) {
    asCollection<Spell5e>(gameData.spells).forEach((spell) => {
      const description = `Level ${spell.level ?? '?'} ${spell.school ?? ''}`
      entries.push(
        buildEntry(
          spell.name ?? '',
          'Spell',
          spell.source ?? 'Unknown',
          description,
          spell as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  const itemTypeNames = buildItemTypeNameMap(gameData.itemTypes ?? [])
  const seenItems = new Set<string>()
  const allItems = [...(gameData.items ?? []), ...(gameData.itemsBase ?? [])]
  allItems.forEach((item) => {
    const identity = `${item.name ?? ''}|${item.source ?? ''}`.toLowerCase()
    if (!item.name || seenItems.has(identity)) return
    seenItems.add(identity)
    const description =
      getPreviewDescription(item.entries ?? item.additionalEntries ?? []) ||
      getItemTypeName(item, itemTypeNames)
    entries.push(
      buildEntry(
        item.name,
        'Item',
        item.source ?? 'Unknown',
        description,
        item as unknown as Record<string, unknown>,
      ),
    )
  })

  if (gameData.itemProperties) {
    gameData.itemProperties.forEach((property) => {
      const description = getPreviewDescription(property.entries ?? [])
      entries.push(
        buildEntry(
          getItemPropertyName(property),
          'Item Property',
          property.source ?? 'Unknown',
          description,
          property as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  if (gameData.itemMasteries) {
    gameData.itemMasteries.forEach((mastery) => {
      const description = getPreviewDescription(mastery.entries ?? [])
      entries.push(
        buildEntry(
          mastery.name ?? '',
          'Weapon Mastery',
          mastery.source ?? 'Unknown',
          description,
          mastery as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  if (gameData.backgrounds) {
    asCollection<Background5e>(gameData.backgrounds).forEach((bg) => {
      const description = getPreviewDescription(bg.entries ?? [])
      entries.push(
        buildEntry(
          bg.name ?? '',
          'Background',
          bg.source ?? 'Unknown',
          description,
          bg as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  if (gameData.organizations) {
    gameData.organizations.forEach((organization) => {
      entries.push(
        buildEntry(
          organization.name ?? '',
          'Organization',
          organization.source ?? 'Unknown',
          organization.description ?? '',
          organization as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  if (gameData.feats) {
    asCollection<Feat5e>(gameData.feats).forEach((feat) => {
      const description = getPreviewDescription(feat.entries ?? [])
      entries.push(
        buildEntry(
          feat.name ?? '',
          'Feat',
          feat.source ?? 'Unknown',
          description,
          feat as unknown as Record<string, unknown>,
        ),
      )
    })
  }

  if (gameData.creatures) {
    gameData.creatures.forEach((creature) => {
      const summary = getCreatureSummary(creature)
      const preview =
        getPreviewDescription(creature.entries ?? []) ||
        getPreviewDescription(creature.trait ?? []) ||
        getPreviewDescription(creature.action ?? [])
      entries.push(
        buildEntry(
          creature.name,
          'Creature',
          creature.source || 'Unknown',
          [summary, preview].filter(Boolean).join(' · '),
          creature as unknown as Record<string, unknown>,
          {
            searchTerms: [
              getCreatureType(creature),
              getCreatureChallengeRating(creature),
              creature.size?.join(' '),
            ]
              .filter(Boolean)
              .join(' '),
          },
        ),
      )
    })
  }

  if (gameData.skills) {
    Object.values(gameData.skills).forEach((skill) => {
      const skillObj = asObj(skill)
      const skillEntries = Array.isArray(skillObj.entries) ? skillObj.entries : []
      const description = getPreviewDescription(skillEntries)
      entries.push(
        buildEntry(
          String(skillObj.name ?? ''),
          'Skill',
          String(skillObj.source ?? 'Unknown'),
          description,
          skillObj,
        ),
      )
    })
  }

  if (gameData.actions) {
    gameData.actions.forEach((action) => {
      const actionObj = asObj(action)
      const actionEntries = Array.isArray(actionObj.entries) ? actionObj.entries : []
      const description = getPreviewDescription(actionEntries)
      entries.push(
        buildEntry(
          String(actionObj.name ?? ''),
          'Action',
          String(actionObj.source ?? 'Unknown'),
          description,
          actionObj,
        ),
      )
    })
  }

  if (gameData.conditions) {
    gameData.conditions.forEach((condition) => {
      const conditionObj = asObj(condition)
      const conditionEntries = Array.isArray(conditionObj.entries) ? conditionObj.entries : []
      const description = getPreviewDescription(conditionEntries)
      entries.push(
        buildEntry(
          String(conditionObj.name ?? ''),
          'Condition',
          String(conditionObj.source ?? 'Unknown'),
          description,
          conditionObj,
        ),
      )
    })
  }

  if (gameData.languages) {
    Object.values(gameData.languages).forEach((language) => {
      const languageObj = asObj(language)
      const languageEntries = Array.isArray(languageObj.entries) ? languageObj.entries : []
      const description = getPreviewDescription(languageEntries) || String(languageObj.type ?? '')
      entries.push(
        buildEntry(
          String(languageObj.name ?? ''),
          'Language',
          String(languageObj.source ?? 'Unknown'),
          description,
          languageObj,
        ),
      )
    })
  }

  if (gameData.deities) {
    gameData.deities.forEach((deity) => {
      const deityObj = asObj(deity)
      const description = String(deityObj.title ?? deityObj.alignment ?? '')
      entries.push(
        buildEntry(
          String(deityObj.name ?? ''),
          'Deity',
          String(deityObj.source ?? 'Unknown'),
          description,
          deityObj,
        ),
      )
    })
  }

  if (gameData.senses) {
    gameData.senses.forEach((sense) => {
      const senseObj = asObj(sense)
      const senseEntries = Array.isArray(senseObj.entries) ? senseObj.entries : []
      const description = getPreviewDescription(senseEntries)
      entries.push(
        buildEntry(
          String(senseObj.name ?? ''),
          'Sense',
          String(senseObj.source ?? 'Unknown'),
          description,
          senseObj,
        ),
      )
    })
  }

  if (gameData.optionalfeatures) {
    gameData.optionalfeatures.forEach((feature) => {
      const featureObj = asObj(feature)
      const featureEntries = Array.isArray(featureObj.entries) ? featureObj.entries : []
      const description = getPreviewDescription(featureEntries)
      entries.push(
        buildEntry(
          String(featureObj.name ?? ''),
          'Optional Feature',
          String(featureObj.source ?? 'Unknown'),
          description,
          featureObj,
        ),
      )
    })
  }

  if (gameData.variantrules) {
    gameData.variantrules.forEach((rule) => {
      const ruleObj = asObj(rule)
      const ruleEntries = Array.isArray(ruleObj.entries) ? ruleObj.entries : []
      const description = getPreviewDescription(ruleEntries)
      entries.push(
        buildEntry(
          String(ruleObj.name ?? ''),
          'Variant Rule',
          String(ruleObj.source ?? 'Unknown'),
          description,
          ruleObj,
        ),
      )
    })
  }

  if (gameData.trapHazards) {
    gameData.trapHazards.forEach((trap) => {
      const trapObj = asObj(trap)
      const trapEntries = Array.isArray(trapObj.entries) ? trapObj.entries : []
      const description = getPreviewDescription(trapEntries)
      entries.push(
        buildEntry(
          String(trapObj.name ?? ''),
          'Trap / Hazard',
          String(trapObj.source ?? 'Unknown'),
          description,
          trapObj,
        ),
      )
    })
  }

  if (gameData.rewards) {
    gameData.rewards.forEach((reward) => {
      const rewardObj = asObj(reward)
      const rewardEntries = Array.isArray(rewardObj.entries) ? rewardObj.entries : []
      const description =
        (typeof rewardObj.type === 'string' ? rewardObj.type : '') ||
        getPreviewDescription(rewardEntries)
      entries.push(
        buildEntry(
          String(rewardObj.name ?? ''),
          'Reward',
          String(rewardObj.source ?? 'Unknown'),
          description,
          rewardObj,
        ),
      )
    })
  }

  if (gameData.cultsBoons) {
    gameData.cultsBoons.forEach((entry) => {
      const obj = asObj(entry)
      const entryList = Array.isArray(obj.entries) ? obj.entries : []
      const description = getPreviewDescription(entryList)
      entries.push(
        buildEntry(
          String(obj.name ?? ''),
          'Cult / Boon',
          String(obj.source ?? 'Unknown'),
          description,
          obj,
        ),
      )
    })
  }

  return deduplicateEntries(entries)
}

function getCompendiumEntryEdition(
  entry: CompendiumEntry,
): Exclude<CompendiumEditionFilter, 'both'> {
  const data = entry.data as Record<string, unknown>
  return data.edition === 'one' || REVISED_CORE_SOURCES.has(entry.source.toUpperCase())
    ? '5.5e'
    : '5e'
}

export function filterCompendiumEntries(
  entries: CompendiumEntry[],
  searchQuery: string,
  activeTypes: Set<string>,
  activeSources: Set<string>,
  editionFilter: CompendiumEditionFilter = 'both',
): CompendiumEntry[] {
  let filtered = entries

  if (activeTypes.size > 0) {
    filtered = filtered.filter((entry) => activeTypes.has(entry.type))
  }

  if (activeSources.size > 0) {
    filtered = filtered.filter((entry) => activeSources.has(entry.source))
  }

  if (editionFilter !== 'both') {
    filtered = filtered.filter((entry) => getCompendiumEntryEdition(entry) === editionFilter)
  }

  if (searchQuery) {
    const queryTerms = tokenizeSearchQuery(searchQuery)
    const queryLower = searchQuery.toLowerCase()
    filtered = filtered.filter((entry) =>
      queryTerms.every((term) => matchesSearchTerm(entry, term)),
    )
    return filtered.sort((a, b) => {
      const diff = scoreEntry(b, queryLower, queryTerms) - scoreEntry(a, queryLower, queryTerms)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name))
}
