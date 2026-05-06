import type { ItemProperty5e, ItemType5e, Language5e } from '@/types/5etools'
import { SOURCE_FALLBACKS } from '../sourceFallbacks'
import { asArray, asObject, type ParsedObject } from './shared'

export function parseBackgrounds(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.background) return asArray(obj.background)
  if (Array.isArray(data)) return data
  return []
}

export function parseFeats(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.feat) return asArray(obj.feat)
  if (Array.isArray(data)) return data
  return []
}

export function parseItems(data: unknown): unknown[] {
  const obj = asObject(data)
  const items: unknown[] = []

  if (obj.item) items.push(...asArray(obj.item))
  if (obj.itemGroup) items.push(...asArray(obj.itemGroup))
  if (obj.baseitem) items.push(...asArray(obj.baseitem))
  if (Array.isArray(data)) items.push(...data)

  return items
}

export function parseActions(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.action) return asArray(obj.action)
  if (Array.isArray(data)) return data
  return []
}

export function parseConditions(data: unknown): unknown[] {
  const obj = asObject(data)
  const results: unknown[] = []
  const tag = (entries: unknown[], sourceType: 'condition' | 'disease') => {
    for (const entry of entries) {
      results.push(
        entry && typeof entry === 'object'
          ? { ...(entry as object), _sourceType: sourceType }
          : entry,
      )
    }
  }
  if (obj.condition) tag(asArray(obj.condition), 'condition')
  if (obj.disease) tag(asArray(obj.disease), 'disease')
  if (Array.isArray(data)) results.push(...data)
  return results
}

export function parseDeities(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.deity) return asArray(obj.deity)
  if (Array.isArray(data)) return data
  return []
}

export function parseSkills(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.skill) return asArray(obj.skill)
  if (Array.isArray(data)) return data
  return []
}

export function parseSenses(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.sense) return asArray(obj.sense)
  if (Array.isArray(data)) return data
  return []
}

export function parseLanguages(data: unknown): Language5e[] {
  const obj = asObject(data)
  if (obj.language) return asArray(obj.language) as Language5e[]
  if (Array.isArray(data)) return data as Language5e[]
  return []
}

export function parseMagicVariants(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.variant) return asArray(obj.variant)
  if (obj.magicvariant) return asArray(obj.magicvariant)
  if (Array.isArray(data)) return data
  return []
}

export function parseOptionalFeatures(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.optionalfeature) return asArray(obj.optionalfeature)
  if (Array.isArray(data)) return data
  return []
}

export function parseVariantRules(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.variantrule) return asArray(obj.variantrule)
  if (Array.isArray(data)) return data
  return []
}

export function parseTrapHazards(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.trap) return asArray(obj.trap)
  if (Array.isArray(data)) return data
  return []
}

export function parseRewards(data: unknown): unknown[] {
  const obj = asObject(data)
  if (obj.reward) return asArray(obj.reward)
  if (Array.isArray(data)) return data
  return []
}

export function parseCultsBoons(data: unknown): unknown[] {
  const obj = asObject(data)
  const results: unknown[] = []
  if (obj.cult) results.push(...asArray(obj.cult))
  if (obj.boon) results.push(...asArray(obj.boon))
  if (results.length > 0) return results
  if (Array.isArray(data)) return data
  return []
}

export function parseItemProperties(data: unknown): ItemProperty5e[] {
  const obj = asObject(data)
  if (obj.itemProperty) return asArray(obj.itemProperty) as ItemProperty5e[]
  return []
}

export function parseItemTypes(data: unknown): ItemType5e[] {
  const obj = asObject(data)
  if (obj.itemType) return asArray(obj.itemType) as ItemType5e[]
  return []
}

export function parseBooks(data: unknown): unknown[] {
  const obj = asObject(data)
  if (!data) return []
  if (obj.book) return asArray(obj.book)
  if (obj.adventure) return asArray(obj.adventure)
  if (Array.isArray(data)) return data
  return []
}

/**
 * Extract named proficiencies from a 5etools proficiency/language block array.
 * Returns an array of string labels (name, "choose N", "any N standard").
 * Omits structural keys like `choose` and `anyStandard`.
 *
 * @param blocks  - e.g. `race.languageProficiencies`, `bg.skillProficiencies`, etc.
 * @param includeAnyStandard - include "any N standard" entries (default true)
 */
export function extractProficiencyBlockNames(
  blocks: unknown[],
  { includeAnyStandard = true } = {},
): string[] {
  const out: string[] = []
  for (const block of blocks) {
    const blockObj = asObject(block)
    for (const [key, val] of Object.entries(blockObj)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    const anyStandard = blockObj.anyStandard
    if (includeAnyStandard && typeof anyStandard === 'number')
      out.push(`any ${anyStandard} standard`)
    const chooseObj = asObject(blockObj.choose)
    if (typeof chooseObj.count === 'number') out.push(`choose ${chooseObj.count}`)
  }
  return out
}

export function buildSourcesList(
  sourceAbbreviations: string[],
  booksData: unknown,
  adventuresData?: unknown,
): Array<{
  abbreviation: string
  name: string
  group: string
  year?: number
  hasCharacterOptions: boolean
}> {
  const booksList = parseBooks(booksData)
  const adventuresList = adventuresData ? parseBooks(adventuresData) : []
  const allEntries = [...booksList, ...adventuresList]
  // Key by both id AND source so entries like {id:"PS-A", source:"PSA"} resolve under both keys
  const booksMap = new Map<string, ParsedObject>()
  for (const entry of allEntries) {
    const entryObj = asObject(entry)
    const id = typeof entryObj.id === 'string' ? entryObj.id : undefined
    const source = typeof entryObj.source === 'string' ? entryObj.source : undefined
    if (id) booksMap.set(id, entryObj)
    if (source && source !== id) booksMap.set(source, entryObj)
  }

  const characterRelevantGroups = [
    'core',
    'supplement',
    'supplement-alt',
    'setting',
    'setting-alt',
    'adventure',
    'organized-play',
  ]

  return sourceAbbreviations
    .map((abbr) => {
      const book =
        booksMap.get(abbr) ??
        (SOURCE_FALLBACKS[abbr] ? { id: abbr, source: abbr, ...SOURCE_FALLBACKS[abbr] } : null)
      if (!book) {
        return {
          abbreviation: abbr,
          name: abbr,
          group: 'other',
          hasCharacterOptions: true,
        }
      }
      const bookObj = asObject(book)
      const group = typeof bookObj.group === 'string' ? bookObj.group : 'other'

      const hasCharacterOptions = characterRelevantGroups.includes(group)
      const published = typeof bookObj.published === 'string' ? bookObj.published : undefined

      return {
        abbreviation:
          typeof bookObj.id === 'string'
            ? bookObj.id
            : typeof bookObj.source === 'string'
              ? bookObj.source
              : abbr,
        name: typeof bookObj.name === 'string' ? bookObj.name : abbr,
        group,
        year: published ? Number.parseInt(published, 10) : undefined,
        hasCharacterOptions,
      }
    })
    .filter((source) => source.hasCharacterOptions !== false)
    .sort((a, b) => {
      const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']
      const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
      if (groupDiff !== 0) return groupDiff
      // Within core: PHB first, DMG second, MM third
      if (a.group === 'core') {
        const coreSlot = (abbr: string) => {
          if (abbr === 'PHB' || abbr === 'XPHB') return 0
          if (abbr === 'DMG' || abbr === 'XDMG') return 1
          if (abbr === 'MM' || abbr === 'XMM') return 2
          return 3
        }
        const slotDiff = coreSlot(a.abbreviation) - coreSlot(b.abbreviation)
        if (slotDiff !== 0) return slotDiff
      }
      if (a.year && b.year && a.year !== b.year) return b.year - a.year
      return a.name.localeCompare(b.name)
    })
}
