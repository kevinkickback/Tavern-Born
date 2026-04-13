export interface CompendiumEntry {
  name: string
  type: string
  source: string
  description?: string
  searchText?: string
  data: Record<string, unknown>
}

interface CompendiumGameData {
  races?: unknown
  classes?: unknown
  spells?: unknown
  items?: unknown[]
  backgrounds?: unknown
  feats?: unknown
  skills?: unknown
  actions?: unknown[]
  conditions?: unknown[]
  languages?: unknown
  deities?: unknown[]
}

function asObj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'object' && value !== null) {
    return Object.values(value)
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

function getPreviewDescription(value: unknown): string {
  if (typeof value === 'string') return value

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === 'string') return first
    return extractSearchText(first)
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
  }
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

export function buildCompendiumEntries(
  gameData: CompendiumGameData | null | undefined,
): CompendiumEntry[] {
  if (!gameData) return []

  const entries: CompendiumEntry[] = []

  if (gameData.races) {
    asCollection(gameData.races).forEach((race) => {
      const raceObj = asObj(race)
      const entriesList = Array.isArray(raceObj.entries) ? raceObj.entries : []
      const description = getPreviewDescription(entriesList)
      entries.push(
        buildEntry(
          String(raceObj.name ?? ''),
          'Race',
          String(raceObj.source ?? 'Unknown'),
          description,
          raceObj,
        ),
      )
    })
  }

  if (gameData.classes) {
    asCollection(gameData.classes).forEach((cls) => {
      const clsObj = asObj(cls)
      const fluffEntries = Array.isArray(asObj(clsObj.fluff).entries)
        ? (asObj(clsObj.fluff).entries as unknown[])
        : []
      const classFluffEntries = Array.isArray(clsObj.fluffEntries) ? clsObj.fluffEntries : []
      const classFluffSections = Array.isArray(clsObj.classFluffSections)
        ? clsObj.classFluffSections
        : []
      const description =
        getPreviewDescription(classFluffEntries) ||
        getPreviewDescription(classFluffSections) ||
        getPreviewDescription(fluffEntries)
      entries.push(
        buildEntry(
          String(clsObj.name ?? ''),
          'Class',
          String(clsObj.source ?? 'Unknown'),
          description,
          clsObj,
        ),
      )
    })
  }

  if (gameData.spells) {
    asCollection(gameData.spells).forEach((spell) => {
      const spellObj = asObj(spell)
      const description = `Level ${String(spellObj.level ?? '?')} ${String(spellObj.school ?? '')}`
      entries.push(
        buildEntry(
          String(spellObj.name ?? ''),
          'Spell',
          String(spellObj.source ?? 'Unknown'),
          description,
          spellObj,
        ),
      )
    })
  }

  if (gameData.items) {
    gameData.items.forEach((item) => {
      const itemObj = asObj(item)
      const itemEntries = Array.isArray(itemObj.entries) ? itemObj.entries : []
      const description = getPreviewDescription(itemEntries) || String(itemObj.type ?? '')
      entries.push(
        buildEntry(
          String(itemObj.name ?? ''),
          'Item',
          String(itemObj.source ?? 'Unknown'),
          description,
          itemObj,
        ),
      )
    })
  }

  if (gameData.backgrounds) {
    asCollection(gameData.backgrounds).forEach((bg) => {
      const bgObj = asObj(bg)
      const bgEntries = Array.isArray(bgObj.entries) ? bgObj.entries : []
      const description = getPreviewDescription(bgEntries)
      entries.push(
        buildEntry(
          String(bgObj.name ?? ''),
          'Background',
          String(bgObj.source ?? 'Unknown'),
          description,
          bgObj,
        ),
      )
    })
  }

  if (gameData.feats) {
    Object.values(gameData.feats).forEach((feat) => {
      const featObj = asObj(feat)
      const featEntries = Array.isArray(featObj.entries) ? featObj.entries : []
      const description = getPreviewDescription(featEntries)
      entries.push(
        buildEntry(
          String(featObj.name ?? ''),
          'Feat',
          String(featObj.source ?? 'Unknown'),
          description,
          featObj,
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
    filtered = filtered.filter((entry) =>
      queryTerms.every((term) => matchesSearchTerm(entry, term)),
    )
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name))
}
