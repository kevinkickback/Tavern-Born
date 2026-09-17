import {
  validateDamageTypeCoverage,
  validateRarityCoverage,
  validateSpellSchoolCoverage,
} from '@/lib/5etools/constants'
import { mapWithConcurrency } from '@/lib/async'
import { validateArmorTypeCodes } from '@/lib/calculations/armorClass'
import { validateSkillToAbilityMap } from '@/lib/calculations/skills'
import { validateParsedSpellSlotProgressions } from '@/lib/calculations/spellSlots'
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
  parseCultsBoons,
  parseDeities,
  parseFeats,
  parseItemMasteries,
  parseItemProperties,
  parseItems,
  parseItemTypes,
  parseLanguages,
  parseMagicVariants,
  parseOptionalFeatures,
  parseOrganizations,
  parseRaceFluffSummaries,
  parseRaces,
  parseRewards,
  parseSenses,
  parseSkills,
  parseSpells,
  parseTrapHazards,
  parseVariantRules,
} from './parsers/index'
import { parseRemoteDataSourceUrl } from './urlUtils'

export interface DataLoaderOptions {
  onProgress?: (current: number, total: number, resource: string) => void
  onResourceFailure?: (resource: string, failure: DataResourceFailure) => void
  signal?: AbortSignal
}

interface DataResourceFailure {
  required: boolean
}

interface IndexedFileEntry {
  file: string
  source?: string
}

interface ExtractIndexFilesOptions {
  treatObjectKeysAsSources?: boolean
}

export const DATA_REQUEST_TIMEOUT_MS = 15_000
export const DATA_FETCH_CONCURRENCY = 6

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error && signal.reason.name === 'AbortError') throw signal.reason
  throw new DOMException('Data loading aborted', 'AbortError')
}

function createTimedSignal(parentSignal?: AbortSignal): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const abortFromParent = () =>
    controller.abort(
      parentSignal?.reason instanceof Error && parentSignal.reason.name === 'AbortError'
        ? parentSignal.reason
        : new DOMException('Data loading aborted', 'AbortError'),
    )
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('Data request timed out', 'TimeoutError'))
  }, DATA_REQUEST_TIMEOUT_MS)

  if (parentSignal?.aborted) {
    abortFromParent()
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

export class FiveEToolsDataLoader {
  private baseUrl: string
  private isRemote: boolean

  constructor(config: DataSourceConfig) {
    this.isRemote = config.type === 'remote'
    if (this.isRemote) {
      const parsedUrl = parseRemoteDataSourceUrl(config.path)
      if (parsedUrl.kind === 'invalid') throw new Error(parsedUrl.error)
      this.baseUrl = parsedUrl.normalizedUrl
    } else {
      this.baseUrl = config.path
    }
  }

  async loadAllData(options?: DataLoaderOptions): Promise<GameData> {
    const resources: Array<{ key: string; file: string; required?: boolean }> = [
      { key: 'books', file: 'books.json' },
      { key: 'adventures', file: 'adventures.json' },
      { key: 'races', file: 'races.json' },
      { key: 'raceFluff', file: 'fluff-races.json', required: false },
      { key: 'backgroundFluff', file: 'fluff-backgrounds.json', required: false },
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
      { key: 'trapHazards', file: 'trapshazards.json' },
      { key: 'rewards', file: 'rewards.json' },
      { key: 'cultsBoons', file: 'cultsboons.json' },
    ]

    const gameData: GameData = {
      races: [],
      classes: [],
      backgrounds: [],
      organizations: [],
      spells: [],
      feats: [],
      items: [],
      itemsBase: [],
      itemProperties: [],
      itemTypes: [],
      itemMasteries: [],
      classFeatures: [],
      actions: [],
      conditions: [],
      deities: [],
      skills: [],
      senses: [],
      languages: [],
      optionalfeatures: [],
      variantrules: [],
      trapHazards: [],
      rewards: [],
      cultsBoons: [],
      sources: [],
    }

    const sourcesSet = new Set<string>()
    let booksData: unknown = null
    let adventuresData: unknown = null
    let classIndexData: unknown = null
    let spellIndexData: unknown = null
    let spellSourceLookupData: unknown = null
    let magicVariants: GameData['items'] = []
    let raceFluffSummaryByKey = new Map<string, string>()
    let loadedTopLevelResources = 0

    let completedResources = 0
    await mapWithConcurrency(resources, DATA_FETCH_CONCURRENCY, async (resource) => {
      throwIfAborted(options?.signal)

      try {
        const data = await this.loadResource(resource.file, options?.signal)
        loadedTopLevelResources += 1

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
            this.addItemSources(gameData.races, sourcesSet)
            break
          case 'raceFluff':
            raceFluffSummaryByKey = new Map(
              parseRaceFluffSummaries(data).map((item) => [
                `${item.name}|${item.source}`,
                item.summary,
              ]),
            )
            break
          case 'backgroundFluff':
            gameData.organizations = parseOrganizations(data)
            this.addItemSources(gameData.organizations, sourcesSet)
            break
          case 'backgrounds':
            gameData.backgrounds = parseBackgrounds(data) as GameData['backgrounds']
            this.addItemSources(gameData.backgrounds, sourcesSet)
            break
          case 'feats':
            gameData.feats = parseFeats(data) as GameData['feats']
            this.addItemSources(gameData.feats, sourcesSet)
            break
          case 'items':
            gameData.items = parseItems(data) as GameData['items']
            this.addItemSources(gameData.items, sourcesSet)
            break
          case 'itemsBase':
            gameData.itemsBase = parseItems(data) as GameData['itemsBase']
            gameData.itemProperties = parseItemProperties(data)
            gameData.itemTypes = parseItemTypes(data)
            gameData.itemMasteries = parseItemMasteries(data)
            this.addItemSources(gameData.itemsBase, sourcesSet)
            this.addItemSources(gameData.itemMasteries, sourcesSet)
            break
          case 'actions':
            gameData.actions = parseActions(data)
            this.addItemSources(gameData.actions, sourcesSet)
            break
          case 'conditions':
            gameData.conditions = parseConditions(data)
            this.addItemSources(gameData.conditions, sourcesSet)
            break
          case 'deities':
            gameData.deities = parseDeities(data)
            this.addItemSources(gameData.deities, sourcesSet)
            break
          case 'skills':
            gameData.skills = parseSkills(data)
            this.addItemSources(gameData.skills, sourcesSet)
            if (import.meta.env.DEV) {
              validateSkillToAbilityMap(gameData.skills)
            }
            break
          case 'senses':
            gameData.senses = parseSenses(data)
            this.addItemSources(gameData.senses, sourcesSet)
            break
          case 'languages':
            gameData.languages = parseLanguages(data)
            this.addItemSources(gameData.languages, sourcesSet)
            break
          case 'magicvariants':
            magicVariants = parseMagicVariants(data)
            this.addItemSources(magicVariants, sourcesSet)
            break
          case 'optionalfeatures':
            gameData.optionalfeatures = parseOptionalFeatures(data)
            this.addItemSources(gameData.optionalfeatures, sourcesSet)
            break
          case 'variantrules':
            gameData.variantrules = parseVariantRules(data)
            this.addItemSources(gameData.variantrules, sourcesSet)
            break
          case 'trapHazards':
            gameData.trapHazards = parseTrapHazards(data)
            this.addItemSources(gameData.trapHazards, sourcesSet)
            break
          case 'rewards':
            gameData.rewards = parseRewards(data)
            this.addItemSources(gameData.rewards, sourcesSet)
            break
          case 'cultsBoons':
            gameData.cultsBoons = parseCultsBoons(data)
            this.addItemSources(gameData.cultsBoons, sourcesSet)
            break
        }
      } catch (error) {
        if (isAbortError(error)) throw error
        console.warn(`Failed to load ${resource.file}:`, error)
        options?.onResourceFailure?.(resource.file, { required: resource.required !== false })
      } finally {
        completedResources += 1
        if (options?.onProgress) {
          options.onProgress(completedResources, resources.length, resource.file)
        }
      }
    })

    if (this.isRemote && loadedTopLevelResources === 0) {
      throw new Error(
        'Unable to load remote data source. Check internet connectivity and source URL.',
      )
    }

    throwIfAborted(options?.signal)

    if (classIndexData) {
      await this.loadClassData(classIndexData, gameData, sourcesSet, options)
    }

    if (raceFluffSummaryByKey.size > 0) {
      gameData.races = gameData.races.map((race) => {
        const summary = raceFluffSummaryByKey.get(`${race.name}|${race.source}`)
        return summary ? { ...race, fluffEntries: [summary] } : race
      })
    }

    throwIfAborted(options?.signal)

    gameData.items.push(...magicVariants)

    if (spellIndexData) {
      await this.loadSpellData(spellIndexData, gameData, sourcesSet, options, spellSourceLookupData)
    }

    gameData.sources = buildSourcesList(Array.from(sourcesSet), booksData, adventuresData)
    gameData.lookups = buildGameDataLookups(gameData)

    if (import.meta.env.DEV) {
      validateParsedSpellSlotProgressions(gameData.classes)
      validateArmorTypeCodes(gameData.lookups.itemTypeByAbbr)
      validateSpellSchoolCoverage(gameData.spells)
      validateDamageTypeCoverage([...(gameData.items ?? []), ...(gameData.itemsBase ?? [])])
      validateRarityCoverage(gameData.items ?? [])
    }

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

    const classResults = await mapWithConcurrency(
      classFiles,
      DATA_FETCH_CONCURRENCY,
      async (classFile) => {
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
          const fluffFile = classFile.file.replace(/^class-/, 'fluff-class-')
          try {
            const fluffData = await this.loadResource(`class/${fluffFile}`, options?.signal)
            fluffSummaries = parseClassFluffSummaries(fluffData)
            richFluff = parseClassFluff(fluffData)
          } catch (error) {
            if (isAbortError(error)) throw error
            options?.onResourceFailure?.(`class/${fluffFile}`, { required: false })
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
          if (isAbortError(error)) throw error
          console.warn(`Failed to load class file ${classFile.file}:`, error)
          options?.onResourceFailure?.(`class/${classFile.file}`, { required: true })
          return {
            classes: [] as GameData['classes'],
            features: [] as GameData['classFeatures'],
          }
        }
      },
    )

    classResults.forEach((result) => {
      allClasses.push(...result.classes)
      allClassFeatures.push(...result.features)
      this.addItemSources(result.classes, sourcesSet)
      this.addItemSources(result.features, sourcesSet)
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

    const spellResults = await mapWithConcurrency(
      spellFiles,
      DATA_FETCH_CONCURRENCY,
      async (spellFile) => {
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
          if (isAbortError(error)) throw error
          console.warn(`Failed to load spell file ${spellFile.file}:`, error)
          options?.onResourceFailure?.(`spells/${spellFile.file}`, { required: true })
          return [] as GameData['spells']
        }
      },
    )

    spellResults.forEach((parsedSpells) => {
      allSpells.push(...parsedSpells)
      this.addItemSources(parsedSpells, sourcesSet)
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
    const timedSignal = createTimedSignal(signal)
    try {
      const response = await fetch(url, { signal: timedSignal.signal })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filename}: ${response.statusText}`)
      }
      return await response.json()
    } finally {
      timedSignal.cleanup()
    }
  }

  private buildUrl(filename: string): string {
    if (!this.isRemote) {
      return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}${filename}`
    }
    return `${this.baseUrl}${this.baseUrl.endsWith('/') ? '' : '/'}data/${filename}`
  }

  private addItemSources(items: readonly unknown[], sourcesSet: Set<string>): void {
    for (const item of items) {
      this.addItemSource(item, sourcesSet)
    }
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
