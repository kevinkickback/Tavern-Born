import { z } from 'zod'
import { SOURCE_FALLBACKS } from './sourceFallbacks'

function validateData<T>(data: any, schema: z.ZodType<T>, resourceName: string): T[] {
  try {
    if (Array.isArray(data)) {
      return data.map((item, index) => {
        try {
          return schema.parse(item)
        } catch (error) {
          console.warn(`Validation error in ${resourceName}[${index}]:`, error)
          return item
        }
      })
    }
    return []
  } catch (error) {
    console.warn(`Failed to validate ${resourceName}:`, error)
    return []
  }
}

export function parseRaces(data: any): any[] {
  const races: any[] = data.race ? [...data.race] : Array.isArray(data) ? [...data] : []
  const subraceEntries: any[] = data.subrace || []

  if (subraceEntries.length === 0) return races

  // Group subraces by parent race. The parent is identified by raceName + raceSource.
  // Some subraces store this directly; others use _copy.raceName / _copy.raceSource.
  const subraceMap = new Map<string, any[]>()
  for (const sr of subraceEntries) {
    const raceName: string | undefined = sr.raceName ?? sr._copy?.raceName
    const raceSource: string | undefined = sr.raceSource ?? sr._copy?.raceSource ?? sr.source
    if (!raceName) continue
    const key = `${raceName}|${raceSource ?? ''}`
    if (!subraceMap.has(key)) subraceMap.set(key, [])
    subraceMap.get(key)!.push(sr)
  }

  // Nest subraces into their parent race objects (non-mutating spread)
  return races.map((race) => {
    const key = `${race.name}|${race.source ?? ''}`
    const nested = subraceMap.get(key)
    if (!nested || nested.length === 0) return race
    return { ...race, subraces: nested }
  })
}

export function parseClasses(data: any): any[] {
  if (data.class) return data.class
  if (Array.isArray(data)) return data
  return []
}

export function parseBackgrounds(data: any): any[] {
  if (data.background) return data.background
  if (Array.isArray(data)) return data
  return []
}

export function parseSpells(data: any): any[] {
  if (data.spell) return data.spell
  if (Array.isArray(data)) return data
  return []
}

export function parseFeats(data: any): any[] {
  if (data.feat) return data.feat
  if (Array.isArray(data)) return data
  return []
}

export function parseItems(data: any): any[] {
  const items: any[] = []
  
  if (data.item) items.push(...data.item)
  if (data.itemGroup) items.push(...data.itemGroup)
  if (data.baseitem) items.push(...data.baseitem)
  if (Array.isArray(data)) items.push(...data)
  
  return items
}

export function parseClassFeatures(data: any): any[] {
  if (data.classFeature) return data.classFeature
  if (Array.isArray(data)) return data
  return []
}

export function parseActions(data: any): any[] {
  if (data.action) return data.action
  if (Array.isArray(data)) return data
  return []
}

export function parseConditions(data: any): any[] {
  const conditions: any[] = []
  if (data.condition) conditions.push(...data.condition)
  if (data.disease) conditions.push(...data.disease)
  if (Array.isArray(data)) conditions.push(...data)
  return conditions
}

export function parseDeities(data: any): any[] {
  if (data.deity) return data.deity
  if (Array.isArray(data)) return data
  return []
}

export function parseSkills(data: any): any[] {
  if (data.skill) return data.skill
  if (Array.isArray(data)) return data
  return []
}

export function parseSenses(data: any): any[] {
  if (data.sense) return data.sense
  if (Array.isArray(data)) return data
  return []
}

export function parseLanguages(data: any): any[] {
  if (data.language) return data.language
  if (Array.isArray(data)) return data
  return []
}

export function parseMagicVariants(data: any): any[] {
  if (data.variant) return data.variant
  if (data.magicvariant) return data.magicvariant
  if (Array.isArray(data)) return data
  return []
}

export function parseOptionalFeatures(data: any): any[] {
  if (data.optionalfeature) return data.optionalfeature
  if (Array.isArray(data)) return data
  return []
}

export function parseVariantRules(data: any): any[] {
  if (data.variantrule) return data.variantrule
  if (Array.isArray(data)) return data
  return []
}

export function parseBooks(data: any): any[] {
  if (!data) return []
  if (data.book) return data.book
  if (data.adventure) return data.adventure
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
  blocks: any[],
  { includeAnyStandard = true } = {},
): string[] {
  const out: string[] = []
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true) out.push(key)
    }
    if (includeAnyStandard && (block as any).anyStandard)
      out.push(`any ${(block as any).anyStandard} standard`)
    const choose = (block as any).choose
    if (choose) out.push(`choose ${choose.count}`)
  }
  return out
}

export function buildSourcesList(sourceAbbreviations: string[], booksData: any, adventuresData?: any): any[] {
  const booksList = parseBooks(booksData)
  const adventuresList = adventuresData ? parseBooks(adventuresData) : []
  const allEntries = [...booksList, ...adventuresList]
  // Key by both id AND source so entries like {id:"PS-A", source:"PSA"} resolve under both keys
  const booksMap = new Map<string, any>()
  for (const entry of allEntries) {
    if (entry.id) booksMap.set(entry.id, entry)
    if (entry.source && entry.source !== entry.id) booksMap.set(entry.source, entry)
  }
  
  const characterRelevantGroups = ['core', 'supplement', 'supplement-alt', 'setting', 'setting-alt', 'adventure', 'organized-play']
  
  return sourceAbbreviations
    .map(abbr => {
      const book = booksMap.get(abbr) ?? (SOURCE_FALLBACKS[abbr]
        ? { id: abbr, source: abbr, ...SOURCE_FALLBACKS[abbr] }
        : null)
      if (!book) {
        return { 
          abbreviation: abbr, 
          name: abbr, 
          group: 'other', 
          hasCharacterOptions: true 
        }
      }
      
      const hasCharacterOptions = characterRelevantGroups.includes(book.group || 'other')
      
      return {
        abbreviation: book.id || book.source || abbr,
        name: book.name || abbr,
        group: book.group || 'other',
        year: book.published ? parseInt(book.published) : undefined,
        hasCharacterOptions
      }
    })
    .filter(source => source.hasCharacterOptions !== false)
    .sort((a, b) => {
      const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']
      const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
      if (groupDiff !== 0) return groupDiff
      if (a.year && b.year && a.year !== b.year) return b.year - a.year
      return a.name.localeCompare(b.name)
    })
}
