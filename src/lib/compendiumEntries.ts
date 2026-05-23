import type { Background5e, Class5e, Feat5e, Item5e, Race5e, Spell5e } from '@/types/5etools'

interface CompendiumEntryBase {
  name: string
  source: string
  description?: string
  searchText?: string
}

type UntypedEntryType =
  | 'Skill'
  | 'Sense'
  | 'Action'
  | 'Condition'
  | 'Language'
  | 'Deity'
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
  | (CompendiumEntryBase & { type: UntypedEntryType; data: Record<string, unknown> })

interface CompendiumGameData {
  races?: Race5e[] | Record<string, Race5e>
  classes?: Class5e[] | Record<string, Class5e>
  spells?: Spell5e[] | Record<string, Spell5e>
  items?: Item5e[]
  backgrounds?: Background5e[] | Record<string, Background5e>
  feats?: Feat5e[] | Record<string, Feat5e>
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

function toSpacedLowerKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function extractSearchText(value: unknown, depth = 0): string {
  if (value == null || depth > 6) return ''

  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    return value.map((item) => extractSearchText(item, depth + 1)).join(' ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nested]) => {
        if (depth > 1 && !['name', 'entries', 'entry', 'source', 'type'].includes(key)) {
          return extractSearchText(nested, depth + 1)
        }
        return `${toSpacedLowerKey(key)} ${extractSearchText(nested, depth + 1)}`
      })
      .join(' ')
  }

  return ''
}

function normalizeSearchText(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isRawTag(s: string): boolean {
  return s.startsWith('{@')
}

function getPreviewDescription(value: unknown): string {
  if (typeof value === 'string') return isRawTag(value) ? '' : value

  if (Array.isArray(value) && value.length > 0) {
    for (const item of value) {
      if (typeof item === 'string' && !isRawTag(item) && item.trim()) return item
    }
    const firstNonString = value.find((item) => typeof item !== 'string')
    if (firstNonString !== undefined) return extractSearchText(firstNonString)
    return ''
  }

  if (typeof value === 'object' && value !== null) {
    return extractSearchText(value)
  }

  return ''
}

function buildEntry(
  name: string,
  type: string,
  source: string,
  description: string,
  data: Record<string, unknown>,
): CompendiumEntry {
  return {
    name,
    type,
    source,
    description,
    searchText: normalizeSearchText(name, type, source, description),
    data,
  } as CompendiumEntry
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

  if (gameData.classes) {
    asCollection<Class5e>(gameData.classes).forEach((cls) => {
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

  if (gameData.items) {
    gameData.items.forEach((item) => {
      const description = getPreviewDescription(item.entries ?? []) || item.type
      entries.push(
        buildEntry(
          item.name ?? '',
          'Item',
          item.source ?? 'Unknown',
          description,
          item as unknown as Record<string, unknown>,
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

  return entries
}

export function filterCompendiumEntries(
  entries: CompendiumEntry[],
  searchQuery: string,
  activeTypes: Set<string>,
  activeSources: Set<string>,
): CompendiumEntry[] {
  let filtered = entries

  if (activeTypes.size > 0) {
    filtered = filtered.filter((entry) => activeTypes.has(entry.type))
  }

  if (activeSources.size > 0) {
    filtered = filtered.filter((entry) => activeSources.has(entry.source))
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
