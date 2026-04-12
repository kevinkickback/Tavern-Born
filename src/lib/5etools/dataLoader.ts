import type { DataSourceConfig, GameData } from '@/types/5etools'
import { buildGameDataLookups } from './lookups'
import {
  buildSourcesList,
  parseActions,
  parseBackgrounds,
  parseClasses,
  parseClassFeatures,
  parseClassFluff,
  parseClassFluffSummaries,
  parseConditions,
  parseDeities,
  parseFeats,
  parseItems,
  parseLanguages,
  parseMagicVariants,
  parseOptionalFeatures,
  parseRaceFluffSummaries,
  parseRaces,
  parseSenses,
  parseSkills,
  parseSpells,
  parseVariantRules,
} from './parsers'

export interface DataLoaderOptions {
  onProgress?: (current: number, total: number, resource: string) => void
  signal?: AbortSignal
}

interface IndexedFileEntry {
  file: string
  source?: string
}

interface ExtractIndexFilesOptions {
  treatObjectKeysAsSources?: boolean
}

export class FiveEToolsDataLoader {
  private baseUrl: string
  private isRemote: boolean

  constructor(config: DataSourceConfig) {
    this.baseUrl = config.path
    this.isRemote = config.type === 'remote'
  }

  async loadAllData(options?: DataLoaderOptions): Promise<GameData> {
    const resources = [
      { key: 'books', file: 'books.json' },
      { key: 'adventures', file: 'adventures.json' },
      { key: 'races', file: 'races.json' },
      { key: 'raceFluff', file: 'fluff-races.json' },
      { key: 'classIndex', file: 'class/index.json' },
      { key: 'backgrounds', file: 'backgrounds.json' },
      { key: 'spellIndex', file: 'spells/index.json' },
      {
        key: 'spellSourceLookup',
        file: 'generated/gendata-spell-source-lookup.json',
      },
      { key: 'feats', file: 'feats.json' },
      { key: 'items', file: 'items.json' },
      { key: 'itemsBase', file: 'items-base.json' },
      { key: 'actions', file: 'actions.json' },
      { key: 'conditions', file: 'conditionsdiseases.json' },
      { key: 'deities', file: 'deities.json' },
      { key: 'skills', file: 'skills.json' },
      { key: 'senses', file: 'senses.json' },
      { key: 'languages', file: 'languages.json' },
      { key: 'magicvariants', file: 'magicvariants.json' },
      { key: 'optionalfeatures', file: 'optionalfeatures.json' },
      { key: 'variantrules', file: 'variantrules.json' },
    ]

    const gameData: GameData = {
      races: [],
      classes: [],
      backgrounds: [],
      spells: [],
      feats: [],
      items: [],
      itemsBase: [],
      classFeatures: [],
      actions: [],
      conditions: [],
      deities: [],
      skills: [],
      senses: [],
      languages: [],
      magicvariants: [],
      optionalfeatures: [],
      variantrules: [],
      sources: [],
    }

    const sourcesSet = new Set<string>()
    let booksData: unknown = null
    let adventuresData: unknown = null
    let classIndexData: unknown = null
    let spellIndexData: unknown = null
    let spellSourceLookupData: unknown = null
    let raceFluffSummaryByKey = new Map<string, string>()

    let completedResources = 0
    await Promise.all(
      resources.map(async (resource) => {
        if (options?.signal?.aborted) {
          throw new Error('Data loading aborted')
        }

        try {
          const data = await this.loadResource(resource.file, options?.signal)

          switch (resource.key) {
            case 'books':
              booksData = data
              break
            case 'adventures':
              adventuresData = data
              break
            case 'classIndex':
              classIndexData = data
              break
            case 'spellIndex':
              spellIndexData = data
              break
            case 'spellSourceLookup':
              spellSourceLookupData = data
              break
            case 'races':
              gameData.races = parseRaces(data) as GameData['races']
              gameData.races.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'raceFluff':
              raceFluffSummaryByKey = new Map(
                parseRaceFluffSummaries(data).map((item) => [
                  `${item.name}|${item.source}`,
                  item.summary,
                ]),
              )
              break
            case 'backgrounds':
              gameData.backgrounds = parseBackgrounds(data) as GameData['backgrounds']
              gameData.backgrounds.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'feats':
              gameData.feats = parseFeats(data) as GameData['feats']
              gameData.feats.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'items':
              gameData.items = parseItems(data) as GameData['items']
              gameData.items.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'itemsBase':
              gameData.itemsBase = parseItems(data) as GameData['itemsBase']
              gameData.itemsBase.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'actions':
              gameData.actions = parseActions(data)
              gameData.actions.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'conditions':
              gameData.conditions = parseConditions(data)
              gameData.conditions.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'deities':
              gameData.deities = parseDeities(data)
              gameData.deities.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'skills':
              gameData.skills = parseSkills(data)
              gameData.skills.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'senses':
              gameData.senses = parseSenses(data)
              gameData.senses.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'languages':
              gameData.languages = parseLanguages(data)
              gameData.languages.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'magicvariants':
              gameData.magicvariants = parseMagicVariants(data)
              gameData.magicvariants.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'optionalfeatures':
              gameData.optionalfeatures = parseOptionalFeatures(data)
              gameData.optionalfeatures.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
            case 'variantrules':
              gameData.variantrules = parseVariantRules(data)
              gameData.variantrules.forEach((item) => {
                this.addItemSource(item, sourcesSet)
              })
              break
          }
        } catch (error) {
          console.warn(`Failed to load ${resource.file}:`, error)
        } finally {
          completedResources += 1
          if (options?.onProgress) {
            options.onProgress(completedResources, resources.length, resource.file)
          }
        }
      }),
    )

    if (classIndexData) {
      await this.loadClassData(classIndexData, gameData, sourcesSet, options)
    }

    if (raceFluffSummaryByKey.size > 0) {
      gameData.races = gameData.races.map((race) => {
        const summary = raceFluffSummaryByKey.get(`${race.name}|${race.source}`)
        return summary ? { ...race, fluffEntries: [summary] } : race
      })
    }

    if (spellIndexData) {
      await this.loadSpellData(spellIndexData, gameData, sourcesSet, options, spellSourceLookupData)
    }

    gameData.sources = buildSourcesList(Array.from(sourcesSet), booksData, adventuresData)
    gameData.lookups = buildGameDataLookups(gameData)

    if (options?.onProgress) {
      options.onProgress(resources.length, resources.length, 'Complete')
    }

    return gameData
  }

  private async loadClassData(
    indexData: unknown,
    gameData: GameData,
    sourcesSet: Set<string>,
    options?: DataLoaderOptions,
  ): Promise<void> {
    const classFiles = this.extractIndexFiles(indexData, {
      treatObjectKeysAsSources: false,
    })

    const allClasses: GameData['classes'] = []
    const allClassFeatures: GameData['classFeatures'] = []

    const classResults = await Promise.all(
      classFiles.map(async (classFile) => {
        try {
          const classData = await this.loadResource(`class/${classFile.file}`, options?.signal)

          let fluffSummaries: Array<{
            name: string
            source: string
            summary: string
          }> = []
          let richFluff: Array<{
            name: string
            source: string
            summary: string
            sections: Array<{ name: string; entries: unknown[] }>
            images?: Array<{
              type: 'image'
              href?: { url?: string; path?: string }
              title?: string
            }>
          }> = []
          try {
            const fluffFile = classFile.file.replace(/^class-/, 'fluff-class-')
            const fluffData = await this.loadResource(`class/${fluffFile}`, options?.signal)
            fluffSummaries = parseClassFluffSummaries(fluffData)
            richFluff = parseClassFluff(fluffData)
          } catch {
            fluffSummaries = []
            richFluff = []
          }

          const fluffSummaryByKey = new Map(
            fluffSummaries.map((item) => [`${item.name}|${item.source}`, item.summary]),
          )
          const richFluffByKey = new Map(
            richFluff.map((item) => [`${item.name}|${item.source}`, item]),
          )

          const parsedClasses = this.filterByIndexedSource(
            parseClasses(classData) as GameData['classes'],
            classFile.source,
          ).map((item) => {
            const summary = fluffSummaryByKey.get(`${item.name}|${item.source}`)
            const fluff = richFluffByKey.get(`${item.name}|${item.source}`)

            return {
              ...item,
              ...(summary ? { fluffEntries: [summary] } : {}),
              ...(fluff?.sections ? { classFluffSections: fluff.sections } : {}),
              ...(fluff?.images ? { classFluffImages: fluff.images } : {}),
            }
          })
          const parsedFeatures = this.filterByIndexedSource(
            parseClassFeatures(classData) as GameData['classFeatures'],
            classFile.source,
          )

          return {
            classes: parsedClasses,
            features: parsedFeatures,
          }
        } catch (error) {
          console.warn(`Failed to load class file ${classFile.file}:`, error)
          return {
            classes: [] as GameData['classes'],
            features: [] as GameData['classFeatures'],
          }
        }
      }),
    )

    classResults.forEach((result) => {
      allClasses.push(...result.classes)
      allClassFeatures.push(...result.features)
      result.classes.forEach((item) => {
        this.addItemSource(item, sourcesSet)
      })
      result.features.forEach((item) => {
        this.addItemSource(item, sourcesSet)
      })
    })

    gameData.classes = allClasses
    gameData.classFeatures = allClassFeatures
  }

  private async loadSpellData(
    indexData: unknown,
    gameData: GameData,
    sourcesSet: Set<string>,
    options?: DataLoaderOptions,
    spellSourceLookupData?: unknown,
  ): Promise<void> {
    const spellFiles = this.extractIndexFiles(indexData)

    const allSpells: GameData['spells'] = []

    const spellResults = await Promise.all(
      spellFiles.map(async (spellFile) => {
        try {
          const spellData = await this.loadResource(`spells/${spellFile.file}`, options?.signal)

          const parsedSpells = this.filterByIndexedSource(
            parseSpells(spellData, {
              sourceLookup: this.asSpellSourceLookup(spellSourceLookupData),
            }) as GameData['spells'],
            spellFile.source,
          )
          return parsedSpells
        } catch (error) {
          console.warn(`Failed to load spell file ${spellFile.file}:`, error)
          return [] as GameData['spells']
        }
      }),
    )

    spellResults.forEach((parsedSpells) => {
      allSpells.push(...parsedSpells)
      parsedSpells.forEach((item) => {
        this.addItemSource(item, sourcesSet)
      })
    })

    gameData.spells = allSpells
  }

  private extractIndexFiles(
    indexData: unknown,
    options?: ExtractIndexFilesOptions,
  ): IndexedFileEntry[] {
    const files: IndexedFileEntry[] = []
    const seen = new Set<string>()
    const treatObjectKeysAsSources = options?.treatObjectKeysAsSources !== false

    const addEntry = (file: string, source?: string) => {
      const cleanFile = file.trim()
      if (!cleanFile) return
      const key = `${cleanFile}|${source ?? ''}`
      if (seen.has(key)) return
      seen.add(key)
      files.push({ file: cleanFile, source })
    }

    if (Array.isArray(indexData)) {
      indexData.forEach((item) => {
        if (typeof item === 'string') addEntry(item)
      })
      return files
    }

    if (typeof indexData !== 'object' || indexData === null) return files

    Object.entries(indexData).forEach(([source, value]) => {
      if (typeof value === 'string') {
        addEntry(value, treatObjectKeysAsSources ? source : undefined)
        return
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string') {
            addEntry(item, treatObjectKeysAsSources ? source : undefined)
          }
        })
      }
    })

    return files
  }

  private asSpellSourceLookup(data: unknown): Record<string, Record<string, unknown>> | undefined {
    if (!data || typeof data !== 'object') return undefined
    return data as Record<string, Record<string, unknown>>
  }

  private filterByIndexedSource<T>(items: T[], source?: string): T[] {
    if (!source) return items
    const sourceLower = source.toLowerCase()
    return items.filter((item) => {
      if (typeof item !== 'object' || item === null) return false
      const itemSource = (item as { source?: unknown }).source
      if (typeof itemSource !== 'string') return true
      return itemSource.toLowerCase() === sourceLower
    })
  }

  private async loadResource(filename: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.isRemote) {
      const sep = this.baseUrl.includes('\\') ? '\\' : '/'
      const fullPath = `${this.baseUrl}${sep}${filename.replace(/\//g, sep)}`
      const readLocalJson = window.electronAPI?.readLocalJson
      if (!readLocalJson) {
        throw new Error('Local data loading requires Electron runtime')
      }
      return readLocalJson(fullPath)
    }

    const url = this.buildUrl(filename)
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filename}: ${response.statusText}`)
    }
    return await response.json()
  }

  private buildUrl(filename: string): string {
    if (!this.isRemote) {
      return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}${filename}`
    }
    return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}data/${filename}`
  }

  private addItemSource(item: unknown, sourcesSet: Set<string>) {
    if (typeof item !== 'object' || item === null) return
    const source = (item as { source?: unknown }).source
    if (typeof source === 'string' && source.length > 0) {
      sourcesSet.add(source)
    }
  }
}

export async function loadDataFromSource(
  config: DataSourceConfig,
  options?: DataLoaderOptions,
): Promise<GameData> {
  const loader = new FiveEToolsDataLoader(config)
  return await loader.loadAllData(options)
}
