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
  const classes: any[] = data.class ? [...data.class] : Array.isArray(data) ? [...data] : []
  const subclassEntries: any[] = data.subclass ?? []

  if (subclassEntries.length === 0) return classes

  // Build maps for intro entries and per-level features from subclassFeature records.
  // XPHB-style subclasses have an intro record whose name === shortName (e.g. "Abjurer").
  // PHB-style subclasses have an intro record whose name === the full subclass name (e.g.
  // "School of Abjuration"), which never matches the shortName ("Abjuration").
  // We capture both patterns: introEntriesMap keyed by shortName, fullNameIntroMap keyed
  // by feature name, so that the lookup below can fall back for PHB-style entries.
  const introEntriesMap = new Map<string, any[]>()
  const fullNameIntroMap = new Map<string, any[]>()
  const levelFeaturesMap = new Map<string, { level: number; features: any[] }[]>()
  const subclassFeatureRecords: any[] = data.subclassFeature ?? []
  for (const scf of subclassFeatureRecords) {
    if (!scf.subclassShortName || !scf.className || !scf.entries) continue
    const key = `${scf.subclassShortName}|${scf.className}|${scf.classSource ?? ''}`
    if (scf.name === scf.subclassShortName) {
      // XPHB-style intro: name === shortName — capture for shortName-keyed lookup
      if (!introEntriesMap.has(key)) introEntriesMap.set(key, scf.entries)
    } else {
      // PHB-style: feature name is the full subclass name (e.g. "School of Abjuration").
      // Index by feature name so the lookup below can find it via sc.name.
      const nameKey = `${scf.name}|${scf.className}|${scf.classSource ?? ''}`
      if (!fullNameIntroMap.has(nameKey)) fullNameIntroMap.set(nameKey, scf.entries)

      // Content feature — group by level for the rich detail pane
      if (!levelFeaturesMap.has(key)) levelFeaturesMap.set(key, [])
      const levels = levelFeaturesMap.get(key)!
      const existing = levels.find((l) => l.level === scf.level)
      if (existing) {
        existing.features.push(scf)
      } else {
        levels.push({ level: scf.level, features: [scf] })
      }
    }
  }

  // Group subclasses by parent class (by className + classSource)
  const subclassMap = new Map<string, any[]>()
  for (const sc of subclassEntries) {
    const className: string | undefined = sc.className
    const classSource: string | undefined = sc.classSource
    if (!className) continue
    const parentKey = `${className}|${classSource ?? ''}`
    if (!subclassMap.has(parentKey)) subclassMap.set(parentKey, [])
    const introKey = `${sc.shortName}|${className}|${classSource ?? ''}`
    // Fallback: PHB-style subclasses where shortName != feature name; look up by sc.name
    const fullNameKey = `${sc.name}|${className}|${classSource ?? ''}`
    const entries = introEntriesMap.get(introKey) ?? fullNameIntroMap.get(fullNameKey) ?? []
    const levelFeatures = levelFeaturesMap.get(introKey) ?? []
    subclassMap.get(parentKey)!.push({ ...sc, entries, levelFeatures })
  }

  // Merge subclasses into their parent class objects
  return classes.map((cls) => {
    const key = `${cls.name}|${cls.source ?? ''}`
    const nested = subclassMap.get(key)
    if (!nested || nested.length === 0) return cls
    return { ...cls, subclasses: nested }
  })
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
