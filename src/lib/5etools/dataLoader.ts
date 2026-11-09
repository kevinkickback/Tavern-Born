import {
  validateDamageTypeCoverage,
  validateRarityCoverage,
  validateSpellSchoolCoverage,
} from '@/lib/5etools/constants'
import { mapWithConcurrency } from '@/lib/async'
import { validateArmorTypeCodes } from '@/lib/calculations/armorClass'
import { validateSkillToAbilityMap } from '@/lib/calculations/skills'
import { validateParsedSpellSlotProgressions } from '@/lib/calculations/spellSlots'
import { collectRevisedSourceAbbreviations } from '@/lib/sourceCompatibility'
import type { DataSourceConfig, GameData } from '@/types/5etools'
import {
  type CopyResolutionDiagnostic,
  CopyResolutionError,
  resolveCopiedRecords,
} from './copyResolution'
import { createEmptyGameData } from './emptyGameData'
import { getFixedShieldBases } from './fixedBonusShields'
import { expandItemEntries, parseItemEntries, retainRawItems } from './itemEntries'
import {
  associateItemTypeEntries,
  getItemTypeEntrySources,
  parseItemTypeEntries,
} from './itemTypeEntries'
import { buildGameDataLookups } from './lookups'
import { appendMagicVariantReferences, parseMagicVariantTemplates } from './magicVariants'
import { parseOptionalClassSections } from './optionalClassSectionSource'
import {
  buildSourcesList,
  parseActions,
  parseBackgroundFluff,
  parseBackgrounds,
  parseClassDocument,
  parseClassFluff,
  parseConditions,
  parseCreatures,
  parseCultsBoons,
  parseDeities,
  parseFeats,
  parseItemMasteries,
  parseItemProperties,
  parseItems,
  parseLanguages,
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
import { parsePsionics } from './parsers/psionics'
import { asArray, asObject } from './parsers/shared'
import {
  associatePrimaryItemTypes,
  parsePrimaryItemTypes,
  resolvePrimaryItemTypes,
} from './primaryItemTypes'
import { createJsonResourceReader, type JsonResourceReader } from './resourceReader'
import { CreatureDataSchema, OptionalClassBookDataSchema } from './schemas'
import { auditSpellRouteMultiplicity } from './spellRouteSources'
import { preserveStartingItemCategories } from './startingItemCategory'
import {
  createIndexedClassResolver,
  createIndexedSubclassFeatureResolver,
  createIndexedSubclassResolver,
} from './subclassSourcePreparation'
import {
  prepareToolProficiencySources,
  preserveToolSourcePresentation,
} from './toolProficiencySource'

export { DATA_REQUEST_TIMEOUT_MS } from './resourceReader'

export interface DataLoaderOptions {
  onProgress?: (current: number, total: number, resource: string) => void
  onResourceFailure?: (resource: string, failure: DataResourceFailure) => void
  signal?: AbortSignal
  /** A source stack retries copies after layering its catalogs. */
  deferCopyResolutionErrors?: boolean
  /** Validate declared document shape before tolerant projection. */
  strictCandidate?: boolean
}

interface DataResourceFailure {
  required: boolean
  cause?: unknown
}

interface IndexedFileEntry {
  file: string
  source?: string
}

interface ExtractIndexFilesOptions {
  treatObjectKeysAsSources?: boolean
}

export const DATA_FETCH_CONCURRENCY = 6
const OPTIONAL_CLASS_BOOK = 'book/book-tce.json'

const loadedCreatureTemplates = new WeakMap<
  GameData,
  Array<{ name: string; source: string; [key: string]: unknown }>
>()

export interface RawRaceData {
  race: unknown[]
  subrace: unknown[]
}
const loadedRaceData = new WeakMap<GameData, RawRaceData>()

export function getLoadedRaceData(gameData: GameData): RawRaceData {
  return loadedRaceData.get(gameData) ?? { race: gameData.races, subrace: [] }
}

export function setLoadedRaceData(gameData: GameData, data: RawRaceData): void {
  loadedRaceData.set(gameData, data)
}

export function getLoadedCreatureTemplates(gameData: GameData) {
  return loadedCreatureTemplates.get(gameData) ?? []
}

const BUNDLED_SRD_SELECTABLE_SOURCES = new Set(['PHB', 'XPHB'])

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function reportIndexedFailure(file: string, error: unknown, options?: DataLoaderOptions): void {
  if (isAbortError(error)) throw error
  console.warn(`Failed to load ${file}:`, error)
  options?.onResourceFailure?.(file, {
    required: true,
    ...(options.strictCandidate ? { cause: error } : {}),
  })
}

function hasCollection(data: unknown, keys: string[]): boolean {
  const document = asObject(data)
  const rows = Array.isArray(data)
    ? [data]
    : keys.filter((key) => key in document).map((key) => document[key])
  return (
    rows.length > 0 &&
    rows.every(
      (collection) =>
        Array.isArray(collection) &&
        collection.every((row) => {
          const { name, source } = asObject(row)
          return (
            typeof name === 'string' &&
            Boolean(name.trim()) &&
            typeof source === 'string' &&
            Boolean(source.trim())
          )
        }),
    )
  )
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error && signal.reason.name === 'AbortError') throw signal.reason
  throw new DOMException('Data loading aborted', 'AbortError')
}

export class FiveEToolsDataLoader {
  private sourceType: DataSourceConfig['type']
  private availableResources: Set<string> | null
  private reader: JsonResourceReader

  constructor(
    config: DataSourceConfig,
    reader: JsonResourceReader = createJsonResourceReader(config),
  ) {
    this.sourceType = config.type
    this.availableResources =
      config.type !== 'bundled' && config.availableResources
        ? new Set(config.availableResources)
        : null
    this.reader = reader
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
      { key: 'bestiaryIndex', file: 'bestiary/index.json', required: false },
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
      {
        key: 'psionics',
        file: 'psionics.json',
        required: this.availableResources?.has('psionics.json') === true,
      },
      { key: 'variantrules', file: 'variantrules.json' },
      { key: 'trapHazards', file: 'trapshazards.json' },
      { key: 'rewards', file: 'rewards.json' },
      { key: 'cultsBoons', file: 'cultsboons.json' },
    ]
    const hasOptionalClassBook = this.availableResources?.has(OPTIONAL_CLASS_BOOK)
    if (hasOptionalClassBook)
      resources.push({ key: 'optionalClassBook', file: OPTIONAL_CLASS_BOOK, required: false })
    const supportedResources =
      this.sourceType === 'bundled'
        ? resources.filter((resource) => resource.key !== 'psionics')
        : resources
    const configuredResources = this.availableResources
      ? supportedResources.filter((resource) => this.availableResources?.has(resource.file))
      : supportedResources

    const gameData = createEmptyGameData()

    const sourcesSet = new Set<string>()
    let booksData: unknown = null
    let adventuresData: unknown = null
    let optionalClassBookData: unknown = null
    let classIndexData: unknown = null
    let spellIndexData: unknown = null
    let bestiaryIndexData: unknown = null
    let raceData: unknown = null
    let spellSourceLookupData: unknown = null
    let raceFluffSummaryByKey = new Map<string, string>()
    let backgroundFluffEntriesByKey = new Map<string, unknown[]>()
    let loadedTopLevelResources = 0

    let completedResources = 0
    await mapWithConcurrency(configuredResources, DATA_FETCH_CONCURRENCY, async (resource) => {
      throwIfAborted(options?.signal)

      try {
        const data = await this.loadResource(resource.file, options?.signal)
        loadedTopLevelResources += 1

        switch (resource.key) {
          case 'optionalClassBook': {
            const book = OptionalClassBookDataSchema.safeParse(data)
            // A readable but invalid book records current unavailability. Only read failures retain the old cache.
            optionalClassBookData = book.success ? book.data : null
            break
          }
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
          case 'bestiaryIndex':
            bestiaryIndexData = data
            break
          case 'spellSourceLookup':
            spellSourceLookupData = data
            break
          case 'races':
            raceData = data
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
            backgroundFluffEntriesByKey = new Map(
              parseBackgroundFluff(data).map((item) => [
                `${item.name}|${item.source}`,
                item.entries,
              ]),
            )
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
            gameData.fixedShieldBases = getFixedShieldBases(gameData)
            gameData.itemEntries = parseItemEntries(data)
            {
              const supplemental = parseItemTypeEntries(data)
              gameData.itemTypeAdditionalEntries = supplemental.records
              gameData.itemTypeEntryDiagnostics = supplemental.diagnostics
              for (const source of getItemTypeEntrySources(supplemental.records))
                sourcesSet.add(source)
            }
            gameData.itemProperties = parseItemProperties(data)
            {
              const primary = parsePrimaryItemTypes(data)
              gameData.itemTypes = primary.records
              gameData.itemTypeDiagnostics = primary.diagnostics
            }
            gameData.itemMasteries = parseItemMasteries(data)
            this.addItemSources(gameData.itemsBase, sourcesSet)
            this.addItemSources(gameData.itemMasteries, sourcesSet)
            break
          case 'actions':
            gameData.actions = parseActions(data)
            this.addItemSources(gameData.actions, sourcesSet)
            break
          case 'psionics':
            gameData.psionics = parsePsionics(data)
            this.addItemSources(gameData.psionics, sourcesSet)
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
            gameData.magicVariants = parseMagicVariantTemplates(data)
            break
          case 'optionalfeatures':
            gameData.optionalfeatures = parseOptionalFeatures(data, resource.file)
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
        const isUndistributedBundledBestiary =
          this.sourceType === 'bundled' && resource.key === 'bestiaryIndex'
        if (!isUndistributedBundledBestiary) {
          console.warn(`Failed to load ${resource.file}:`, error)
          options?.onResourceFailure?.(resource.file, {
            required: resource.required !== false,
            ...(options.strictCandidate ? { cause: error } : {}),
          })
        }
      } finally {
        completedResources += 1
        if (options?.onProgress) {
          options.onProgress(completedResources, configuredResources.length, resource.file)
        }
      }
    })

    if (loadedTopLevelResources === 0) {
      throw new Error(
        this.sourceType === 'bundled'
          ? 'Unable to load the included SRD. Reinstall Tavern Born or restore the application files.'
          : this.sourceType === 'remote'
            ? 'Unable to load additional content. Check internet connectivity and the source address.'
            : 'Unable to load additional content from the selected folder.',
      )
    }

    throwIfAborted(options?.signal)

    if (hasOptionalClassBook)
      gameData.optionalClassSections = parseOptionalClassSections(
        optionalClassBookData,
        booksData,
        OPTIONAL_CLASS_BOOK,
      )

    if (classIndexData) {
      await this.loadClassData(classIndexData, gameData, sourcesSet, options)
    }

    if (raceData) {
      const payload = raceData as Partial<RawRaceData>
      const raw: RawRaceData = {
        race: (Array.isArray(raceData)
          ? raceData
          : Array.isArray(payload.race)
            ? payload.race
            : []
        ).map((value) => {
          const race = value as { name: string; source: string }
          const summary = raceFluffSummaryByKey.get(`${race.name}|${race.source}`)
          return summary ? { ...race, fluffEntries: [summary] } : race
        }),
        subrace: Array.isArray(payload.subrace) ? payload.subrace : [],
      }
      setLoadedRaceData(gameData, raw)
      try {
        gameData.races = parseRaces(raw, {
          deferResolutionErrors: options?.deferCopyResolutionErrors,
        }) as GameData['races']
      } catch (error) {
        if (error instanceof CopyResolutionError) {
          for (const diagnostic of error.diagnostics)
            options?.onResourceFailure?.(`Copied entity: ${diagnostic.entity}`, { required: true })
        }
        throw error
      }
      this.addItemSources(
        [
          ...gameData.races,
          ...gameData.races.flatMap((race) => race.subraces ?? []),
          ...raw.subrace,
        ],
        sourcesSet,
      )
    }

    if (backgroundFluffEntriesByKey.size > 0) {
      gameData.backgrounds = gameData.backgrounds.map((background) => {
        const fluffEntries = backgroundFluffEntriesByKey.get(
          `${background.name}|${background.source}`,
        )
        return fluffEntries ? { ...background, fluffEntries } : background
      })
    }

    throwIfAborted(options?.signal)

    retainRawItems(gameData)
    const concreteItemCount = gameData.items.length
    const rawToolInputs = [...gameData.items, ...gameData.itemsBase]
    const resolvedItems = resolveCopiedRecords(rawToolInputs, 'item')
    const toolAuditedItems = prepareToolProficiencySources(
      rawToolInputs,
      preserveStartingItemCategories(rawToolInputs, resolvedItems.records),
    )
    gameData.items = toolAuditedItems.slice(0, concreteItemCount)
    gameData.itemsBase = toolAuditedItems.slice(concreteItemCount)
    appendMagicVariantReferences(gameData)
    this.addItemSources(gameData.items, sourcesSet)
    const itemCount = gameData.items.length
    resolvePrimaryItemTypes(gameData)
    const beforeToolPresentation = [...gameData.items, ...gameData.itemsBase]
    const describedItems = preserveToolSourcePresentation(
      beforeToolPresentation,
      associateItemTypeEntries(
        associatePrimaryItemTypes(
          expandItemEntries(beforeToolPresentation, gameData.itemEntries ?? []),
          gameData.itemTypes,
          gameData.itemEntries ?? [],
        ),
        gameData.itemTypeAdditionalEntries ?? [],
        gameData.itemEntries ?? [],
      ),
    )
    gameData.items = describedItems.slice(0, itemCount)
    gameData.itemsBase = describedItems.slice(itemCount)
    if (resolvedItems.diagnostics.length && import.meta.env.DEV) {
      console.warn('Unresolved copied items:', resolvedItems.diagnostics)
    }

    if (spellIndexData) {
      await this.loadSpellData(spellIndexData, gameData, sourcesSet, options, spellSourceLookupData)
    }

    const creatureDiagnostics = bestiaryIndexData
      ? await this.loadCreatureData(bestiaryIndexData, gameData, options)
      : []

    const copyDiagnostics = [...resolvedItems.diagnostics, ...creatureDiagnostics]
    if (copyDiagnostics.length > 0 && !options?.deferCopyResolutionErrors) {
      for (const diagnostic of copyDiagnostics) {
        options?.onResourceFailure?.(`Copied entity: ${diagnostic.entity}`, { required: true })
      }
      throw new CopyResolutionError(copyDiagnostics, 'in the selected source')
    }

    const sourceCatalog = buildSourcesList(
      Array.from(sourcesSet),
      booksData,
      adventuresData,
      collectRevisedSourceAbbreviations(gameData),
    )
    gameData.sources =
      this.sourceType === 'bundled'
        ? sourceCatalog.map((source) => ({
            ...source,
            hasCharacterOptions: BUNDLED_SRD_SELECTABLE_SOURCES.has(source.abbreviation),
          }))
        : sourceCatalog
    gameData.lookups = buildGameDataLookups(gameData)

    if (import.meta.env.DEV) {
      validateParsedSpellSlotProgressions(gameData.classes)
      validateArmorTypeCodes(gameData.lookups.itemTypeByAbbr)
      validateSpellSchoolCoverage(gameData.spells)
      validateDamageTypeCoverage([...(gameData.items ?? []), ...(gameData.itemsBase ?? [])])
      validateRarityCoverage(gameData.items ?? [])
    }

    if (options?.onProgress) {
      options.onProgress(configuredResources.length, configuredResources.length, 'Complete')
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

    const documents = new Map<string, unknown>()
    const loadedClasses = await mapWithConcurrency(
      classFiles,
      DATA_FETCH_CONCURRENCY,
      async ({ file }) => {
        try {
          const classData = await this.loadResource(`class/${file}`, options?.signal)
          if (
            options?.strictCandidate &&
            !hasCollection(classData, ['class', 'subclass', 'classFeature', 'subclassFeature'])
          )
            throw new SyntaxError('Expected a class or feature collection')
          let fluff: ReturnType<typeof parseClassFluff> = []
          if (options?.strictCandidate) {
            const { class: classes, subclass: subclasses } = asObject(classData)
            const owners = new Set(
              asArray(classes).map((row) => {
                const { name, source } = asObject(row)
                return `${name}|${source}`
              }),
            )
            const orphan = asArray(subclasses)
              .map(asObject)
              .find((row) => !owners.has(`${row.className}|${row.classSource}`))
            if (orphan)
              throw new SyntaxError(
                `Subclass ${orphan.name} requires ${orphan.className}|${orphan.classSource} in the same class document`,
              )
          }
          const fluffFile = `class/${file.replace(/^class-/, 'fluff-class-')}`
          try {
            fluff = parseClassFluff(await this.loadResource(fluffFile, options?.signal))
          } catch (error) {
            if (isAbortError(error)) throw error
            options?.onResourceFailure?.(fluffFile, { required: false })
          }
          documents.set(file, classData)
          return { file, classData, fluff }
        } catch (error) {
          reportIndexedFailure(`class/${file}`, error, options)
        }
      },
    )

    const prepareFeatures = createIndexedSubclassFeatureResolver(indexData, documents)
    const prepareClasses = createIndexedClassResolver(indexData, documents)
    const prepareSubclasses = createIndexedSubclassResolver(indexData, documents)
    const optionalClassFeatureSources: NonNullable<GameData['optionalClassFeatureSources']> = []
    const classCastingSources: NonNullable<GameData['classCastingSources']> = []
    for (const loaded of loadedClasses) {
      if (!loaded) continue
      throwIfAborted(options?.signal)
      const { file, classData, fluff } = loaded
      try {
        const parsedDocument = parseClassDocument(
          classData,
          `class/${file}`,
          prepareFeatures(file),
          { classes: prepareClasses(file), subclasses: prepareSubclasses(file) },
        )
        const fluffByKey = new Map(fluff.map((item) => [`${item.name}|${item.source}`, item]))
        const classes = parsedDocument.classes as GameData['classes']
        for (const item of classes) {
          const details = fluffByKey.get(`${item.name}|${item.source}`)
          if (!details) continue
          item.fluffEntries = [details.summary]
          item.classFluffSections = details.sections
          if (details.images) item.classFluffImages = details.images
        }
        const features = parsedDocument.classFeatures as GameData['classFeatures']
        gameData.classes.push(...classes)
        gameData.classFeatures.push(...features)
        optionalClassFeatureSources.push(...parsedDocument.optionalClassFeatureSources)
        classCastingSources.push(...parsedDocument.classCastingSources)
        this.addItemSources(classes, sourcesSet)
        this.addItemSources(features, sourcesSet)
      } catch (error) {
        reportIndexedFailure(`class/${file}`, error, options)
      }
    }
    gameData.optionalClassFeatureSources = optionalClassFeatureSources
    gameData.classCastingSources = classCastingSources
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
          if (options?.strictCandidate && !hasCollection(spellData, ['spell']))
            throw new SyntaxError('Expected a spell collection')

          const spells = parseSpells(spellData, {
            sourceLookup: this.asSpellSourceLookup(spellSourceLookupData),
            origin: `spells/${spellFile.file}`,
          }) as GameData['spells']
          const parsedSpells = this.filterByIndexedSource(spells, spellFile.source)
          if (options?.strictCandidate && spells.length && !parsedSpells.length)
            throw new SyntaxError(`No spells match the indexed source ${spellFile.source}`)
          return parsedSpells
        } catch (error) {
          reportIndexedFailure(`spells/${spellFile.file}`, error, options)
          return [] as GameData['spells']
        }
      },
    )

    spellResults.forEach((parsedSpells) => {
      allSpells.push(...parsedSpells)
      this.addItemSources(parsedSpells, sourcesSet)
    })

    gameData.spells = auditSpellRouteMultiplicity(allSpells, 'spell-loader')
  }

  private async loadCreatureData(
    indexData: unknown,
    gameData: GameData,
    options?: DataLoaderOptions,
  ): Promise<CopyResolutionDiagnostic[]> {
    const creatureFiles = this.extractIndexFiles(indexData)
    const results = await mapWithConcurrency(
      creatureFiles,
      DATA_FETCH_CONCURRENCY,
      async (creatureFile) => {
        try {
          const data = CreatureDataSchema.parse(
            await this.loadResource(`bestiary/${creatureFile.file}`, options?.signal),
          )
          const parsed = this.filterByIndexedSource(parseCreatures(data), creatureFile.source)
          if (options?.strictCandidate && data.monster.length && !parsed.length)
            throw new SyntaxError(`No creatures match the indexed source ${creatureFile.source}`)
          return parsed
        } catch (error) {
          reportIndexedFailure(`bestiary/${creatureFile.file}`, error, options)
          return [] as NonNullable<GameData['creatures']>
        }
      },
    )

    const creatures = results.flat()
    let templates: Array<{ name: string; source: string; [key: string]: unknown }> = []
    if (
      creatures.some((creature) =>
        Array.isArray((creature._copy as { _templates?: unknown[] } | undefined)?._templates),
      )
    ) {
      try {
        const templateData = await this.loadResource('bestiary/template.json', options?.signal)
        const templateRecord = templateData as { monsterTemplate?: unknown[] }
        templates = (templateRecord.monsterTemplate ?? []).filter(
          (value): value is (typeof templates)[number] =>
            Boolean(
              value &&
                typeof value === 'object' &&
                typeof (value as { name?: unknown }).name === 'string' &&
                typeof (value as { source?: unknown }).source === 'string',
            ),
        )
      } catch (error) {
        if (isAbortError(error)) throw error
        // A layered source may use a template supplied by another layer. Final copy
        // resolution reports a required failure if the template remains unavailable.
        console.warn('Failed to load bestiary templates:', error)
      }
    }
    const resolved = resolveCopiedRecords(creatures, 'monster', templates)
    gameData.creatures = resolved.records
    loadedCreatureTemplates.set(gameData, templates)
    if (resolved.diagnostics.length && import.meta.env.DEV) {
      console.warn('Unresolved copied creatures:', resolved.diagnostics)
    }
    return resolved.diagnostics
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

  private loadResource(filename: string, signal?: AbortSignal): Promise<unknown> {
    return this.reader.readJson(filename, signal)
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
  reader?: JsonResourceReader,
): Promise<GameData> {
  const loader = new FiveEToolsDataLoader(config, reader)
  return await loader.loadAllData(options)
}
