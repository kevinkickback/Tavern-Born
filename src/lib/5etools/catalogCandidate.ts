import { settleOnAbort } from '@/lib/abortable'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  computeGameDataFingerprint,
  type GameDataLayerCacheMetadataByRole,
} from '@/lib/storage/dataCache'
import type {
  CatalogResourceProof,
  DataSourceConfig,
  GameData,
  GameDataSourceStack,
} from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import {
  CatalogCheckError,
  CatalogDependencyError,
  type CatalogDependencyFailure,
  describeCatalogReference,
  LOCAL_DATA_FOLDER_UNAVAILABLE,
} from './catalogCheckError'
import { describeCatalogContents, listCatalogContents } from './catalogContents'
import { createPartialCatalogReader } from './catalogPartialImport'
import { observeCatalogResources } from './catalogResourceProof'
import {
  assertLayerDependencies,
  type ContentLayerDependencyIssue,
  composeGameDataLayers,
  externalCatalogKeys,
  hasCatalogRecords,
  loadGameDataSourceStack,
} from './contentLayers'
import { CopyResolutionError } from './copyResolution'
import type { DataLoaderOptions } from './dataLoader'
import { getLoadedRaceData, loadDataFromSource } from './dataLoader'
import { getRawItems } from './itemEntries'
import {
  createJsonResourceReader,
  isMissingCatalogResource,
  type JsonResourceReader,
  type ReadSourceJson,
} from './resourceReader'
import { resolveSourceRevision } from './sourceRevision'
import { hasUniqueSpellRouteSource } from './spellRouteSources'
import { inspectCatalogResources } from './validator'

export interface PreparedCatalog {
  config: Exclude<DataSourceConfig, { type: 'bundled' }>
  identity: GameDataSourceStack | DataSourceConfig
  data: GameData
  keys: string[]
  warnings: string[]
  contents?: string
  contentsDetails?: string[]
  dependencyWarnings?: string[]
  partialImport?: { skipped: string[] }
  unavailableResources?: string[]
  revision?: string
  layerMetadata?: GameDataLayerCacheMetadataByRole
}

interface CatalogReadSnapshot {
  source: Awaited<ReturnType<typeof resolveSourceRevision>>
  config: PreparedCatalog['config']
  base?: GameDataSourceStack['base']
  scan: Awaited<ReturnType<typeof inspectCatalogResources>>
  partial?: ReturnType<typeof createPartialCatalogReader>
  baseReader?: JsonResourceReader
  observation?: ReturnType<typeof observeCatalogResources>
}

function getMissingSubclassSpells(data: GameData, additional: GameData) {
  const failures: Array<
    CatalogDependencyFailure & Required<Pick<CatalogDependencyFailure, 'subclass'>>
  > = []
  const available = new Set(
    data.spells
      .filter((spell) => !('classSpellRouteSource' in spell) || hasUniqueSpellRouteSource(spell))
      .map(({ name, source }) => getSpellReferenceKey(name, source)),
  )
  for (const parent of additional.classes) {
    for (const subclass of parent.subclasses ?? []) {
      for (const block of subclass.additionalSpells ?? []) {
        try {
          const [parsed] = parseAdditionalSpellBlocks([block as AdditionalSpellBlock])
          const references = [
            ...parsed.grants.map(({ spellName }) => spellName),
            ...parsed.choices.flatMap(({ pool }) => pool ?? []),
            ...(parsed.expanded ?? []).map(({ reference }) => reference),
          ]
          for (const reference of references) {
            if (!available.has(getSpellReferenceKey(reference)))
              failures.push({ parent, subclass, reference })
          }
        } catch {
          // Domain adapters own spell schedules outside the supported native format.
        }
      }
    }
  }
  return failures
}
export async function prepareCatalog(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
  allowPartial = false,
): Promise<PreparedCatalog> {
  onProgress?.(0, 0, 'Checking source')
  const source = await resolveSourceRevision(config, signal, read)
  const candidate = await prepareResolvedCatalog(
    source,
    base,
    signal,
    onProgress,
    read,
    undefined,
    allowPartial,
  )
  if (!candidate) throw new Error('The source did not produce a new catalog.')
  return candidate
}

export async function checkCatalogRevision(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  verifiedRevision: string | CatalogResourceProof,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
): Promise<PreparedCatalog | null> {
  onProgress?.(0, 0, 'Checking source')
  const source = await resolveSourceRevision(config, signal, read)
  signal.throwIfAborted()
  if (typeof verifiedRevision === 'string' && source.revision === verifiedRevision) return null
  return prepareResolvedCatalog(
    source,
    base,
    signal,
    onProgress,
    read,
    typeof verifiedRevision === 'object' ? verifiedRevision : undefined,
  )
}

async function prepareResolvedCatalog(
  source: Awaited<ReturnType<typeof resolveSourceRevision>>,
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
  priorProof?: CatalogResourceProof,
  allowPartial = false,
): Promise<PreparedCatalog | null> {
  const { config } = source
  const observation = source.revision
    ? undefined
    : observeCatalogResources(source.readConfig, read, signal)
  if (observation && (await observation.matches(priorProof))) return null
  const reader = observation?.reader ?? createJsonResourceReader(source.readConfig, read)
  const scan = await settleOnAbort(
    inspectCatalogResources(
      reader,
      config.availableResources ?? [],
      signal,
      !!config.lastLoaded && !config.availableResources,
    ),
    signal,
  )
  const admitted = { ...source.config, isValid: true, availableResources: scan.resources }
  const partial =
    allowPartial && !config.lastLoaded && !config.availableResources && !scan.warnings.length
      ? createPartialCatalogReader(scan.reader)
      : undefined
  const bundledReader = base && (read || partial) ? createJsonResourceReader(base, read) : undefined
  const bundledResources = new Map<string, Promise<unknown>>()
  const baseReader: JsonResourceReader | undefined =
    bundledReader && partial
      ? {
          type: 'bundled',
          readJson(path, signal) {
            const pending = bundledResources.get(path) ?? bundledReader.readJson(path, signal)
            bundledResources.set(path, pending)
            return pending
          },
        }
      : bundledReader
  const snapshot = { source, config: admitted, base, scan, partial, baseReader, observation }

  for (;;) {
    signal.throwIfAborted()
    try {
      return await prepareCatalogSnapshot(snapshot, signal, onProgress)
    } catch (error) {
      if (!(error instanceof CatalogDependencyError) || !partial?.skip(error.failures)) throw error
    }
  }
}

async function prepareCatalogSnapshot(
  { source, config: admitted, base, scan, partial, baseReader, observation }: CatalogReadSnapshot,
  signal: AbortSignal,
  onProgress: DataLoaderOptions['onProgress'],
): Promise<PreparedCatalog> {
  const { config } = source
  const issues: string[] = []
  const copyFailures: CatalogDependencyFailure[] = []
  let folderUnavailable = false
  let allRequiredFailuresIdentified = true
  const warnings = [...scan.warnings]
  const unavailable = [...scan.unavailable]
  const assertRequiredResources = () => {
    if (folderUnavailable) throw new CatalogCheckError(LOCAL_DATA_FOLDER_UNAVAILABLE, issues)
    if (!issues.length) return
    const message = `Could not load required game data. ${issues[0]}`
    if (allRequiredFailuresIdentified && copyFailures.length)
      throw new CatalogDependencyError(message, issues, copyFailures)
    throw new CatalogCheckError(message, issues)
  }
  const dependencyWarnings = new Set<string>()
  const onOptionalDependency = ({ owner, reference }: ContentLayerDependencyIssue) => {
    const label = owner.split('/').map(describeCatalogReference).join(' / ')
    dependencyWarnings.add(
      `${label} can’t offer ${describeCatalogReference(reference)} because it’s unavailable.`,
    )
  }
  let additional: GameData | undefined
  const layerMetadata: GameDataLayerCacheMetadataByRole = {}
  const sourceReader = partial?.reader ?? scan.reader
  const additionalReader: JsonResourceReader =
    config.type === 'local'
      ? {
          type: 'local',
          async readJson(path, readSignal) {
            try {
              return await sourceReader.readJson(path, readSignal)
            } catch (error) {
              if (error instanceof Error && error.message === LOCAL_DATA_FOLDER_UNAVAILABLE)
                folderUnavailable = true
              throw error
            }
          },
        }
      : sourceReader
  const options = {
    signal,
    strictCandidate: true,
    onProgress,
    onResourceFailure: (resource: string, failure: { required: boolean; cause?: unknown }) => {
      const detail = failure.cause instanceof Error ? ` — ${failure.cause.message}` : ''
      const message = `${resource}${detail}`
      const fromBase = resource.startsWith('Included SRD: ')
      const file = resource.replace(/^Additional content: /, '')
      const previouslyAvailable = !fromBase && config.availableResources?.includes(file)
      const missing = isMissingCatalogResource(fromBase ? 'bundled' : config.type, failure.cause)
      const refreshingIndexedClass =
        file.startsWith('class/fluff-class-') &&
        (config.lastLoaded || config.availableResources?.includes('class/index.json'))
      if (
        failure.required ||
        (!missing && (fromBase || previouslyAvailable || refreshingIndexedClass))
      ) {
        issues.push(message)
        const diagnosed =
          !fromBase && failure.cause instanceof CopyResolutionError
            ? failure.cause.diagnostics.flatMap(({ affectedClass }) =>
                affectedClass ? [affectedClass] : [],
              )
            : []
        if (
          failure.cause instanceof CopyResolutionError &&
          diagnosed.length &&
          diagnosed.length === failure.cause.diagnostics.length
        ) {
          copyFailures.push(...diagnosed)
        } else allRequiredFailuresIdentified = false
      } else if (fromBase || !missing) {
        warnings.push(message)
        if (!missing) unavailable.push(file)
      }
    },
  }
  const load = base
    ? loadGameDataSourceStack(
        { base, additional: admitted },
        {
          ...options,
          onOptionalDependency,
          baseReader,
          additionalReader,
          onLayerLoaded: (role, data) => {
            assertRequiredResources()
            if (role === 'base' && !hasCatalogRecords(data))
              throw new Error('The Included SRD could not be loaded.')
            if (role === 'additional') additional = data
            layerMetadata[role] = {
              contentFingerprint: computeGameDataFingerprint(data),
              entityCount: externalCatalogKeys(data).length,
            }
          },
        },
      )
    : loadDataFromSource(admitted, options, additionalReader)
  const loaded = await settleOnAbort(load, signal)
  assertRequiredResources()
  // Exact feature targets can live in a different indexed document in the same source.
  const data = base ? loaded : composeGameDataLayers([loaded])
  if (!base) assertLayerDependencies(data, loaded, undefined, onOptionalDependency)
  const magicIssue = data.magicVariantDiagnostics?.find(
    ({ message }) => !message.startsWith('Reference collides'),
  )
  if (magicIssue) throw new Error(`${magicIssue.path}: ${magicIssue.message}`)
  const missingSpells = getMissingSubclassSpells(data, additional ?? loaded)
  if (missingSpells.length) {
    const { subclass, reference } = missingSpells[0]
    const owner = `${subclass.name}|${subclass.source}`
    throw new CatalogDependencyError(
      `${describeCatalogReference(owner)} needs the spell ${describeCatalogReference(reference)}. Include that spell and check again.`,
      [`${owner} needs ${reference}`],
      missingSpells,
    )
  }
  const supplied = additional ?? loaded
  const keys = externalCatalogKeys(supplied)
  if (!keys.length) throw new Error('The additional source has no usable game data.')
  const suppliedItems = getRawItems(supplied)
  const { primary, supporting } = listCatalogContents(
    suppliedItems.items.length === supplied.items.length &&
      suppliedItems.itemsBase.length === supplied.itemsBase.length
      ? keys
      : externalCatalogKeys({ ...supplied, ...suppliedItems }),
    getLoadedRaceData(supplied),
  )
  const skipped = partial ? [...partial.skippedRecords.values()] : []
  const included = [...primary, ...supporting]
  if (skipped.length && (!included.length || unavailable.length || partial?.hasUncertainRead()))
    throw new Error('The source does not have a verified set of working content to import.')
  admitted.resourceProof =
    skipped.length || warnings.length || unavailable.length ? undefined : observation?.proof()
  return {
    config: admitted,
    identity: base ? { base, additional: admitted } : admitted,
    data,
    keys,
    warnings,
    contents: describeCatalogContents(included),
    contentsDetails: included,
    ...(skipped.length ? { partialImport: { skipped } } : {}),
    ...(dependencyWarnings.size ? { dependencyWarnings: [...dependencyWarnings] } : {}),
    ...(unavailable.length ? { unavailableResources: unavailable } : {}),
    revision: source.revision,
    layerMetadata,
  }
}
