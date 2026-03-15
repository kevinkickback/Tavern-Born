import { z } from 'zod'

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
  if (data.race) return data.race
  if (Array.isArray(data)) return data
  return []
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
  const items = []
  
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
  const conditions = []
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
  if (Array.isArray(data)) return data
  return []
}

export function buildSourcesList(sourceAbbreviations: string[], booksData: any): any[] {
  const booksList = parseBooks(booksData)
  const booksMap = new Map(booksList.map(book => [book.id || book.source, book]))
  
  const characterRelevantGroups = ['core', 'supplement', 'setting', 'adventure']
  
  return sourceAbbreviations
    .map(abbr => {
      const book = booksMap.get(abbr)
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
