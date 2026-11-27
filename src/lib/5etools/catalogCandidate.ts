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
import { CatalogCheckError, describeCatalogReference } from './catalogCheckError'
import { describeCatalogContents } from './catalogContents'
import { observeCatalogResources } from './catalogResourceProof'
import {
  assertLayerDependencies,
  type ContentLayerDependencyIssue,
  composeGameDataLayers,
  externalCatalogKeys,
  hasCatalogRecords,
  loadGameDataSourceStack,
} from './contentLayers'
import type { DataLoaderOptions } from './dataLoader'
import { getLoadedRaceData, loadDataFromSource } from './dataLoader'
import { getRawItems } from './itemEntries'
import {
  createJsonResourceReader,
  isMissingCatalogResource,
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
  dependencyWarnings?: string[]
  unavailableResources?: string[]
  revision?: string
  layerMetadata?: GameDataLayerCacheMetadataByRole
}

function getMissingSubclassSpell(data: GameData, additional: GameData) {
  const available = new Set(
    data.spells
      .filter((spell) => !('classSpellRouteSource' in spell) || hasUniqueSpellRouteSource(spell))
      .map(({ name, source }) => getSpellReferenceKey(name, source)),
  )
  for (const owner of additional.classes) {
    for (const subclass of owner.subclasses ?? []) {
      for (const block of subclass.additionalSpells ?? []) {
        try {
          const [parsed] = parseAdditionalSpellBlocks([block as AdditionalSpellBlock])
          const references = [
            ...parsed.grants.map(({ spellName }) => spellName),
            ...parsed.choices.flatMap(({ pool }) => pool ?? []),
            ...(parsed.expanded ?? []).map(({ reference }) => reference),
          ]
          const missing = references.find(
            (reference) => !available.has(getSpellReferenceKey(reference)),
          )
          if (missing) return { owner: `${subclass.name}|${subclass.source}`, spell: missing }
        } catch {
          // Domain adapters own spell schedules outside the supported native format.
        }
      }
    }
  }
}
export async function prepareCatalog(
  config: PreparedCatalog['config'],
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
): Promise<PreparedCatalog> {
  onProgress?.(0, 0, 'Checking source')
  const source = await resolveSourceRevision(config, signal, read)
  return prepareResolvedCatalog(source, base, signal, onProgress, read)
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

function prepareResolvedCatalog(
  source: Awaited<ReturnType<typeof resolveSourceRevision>>,
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
): Promise<PreparedCatalog>
function prepareResolvedCatalog(
  source: Awaited<ReturnType<typeof resolveSourceRevision>>,
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress: DataLoaderOptions['onProgress'],
  read: ReadSourceJson | undefined,
  priorProof: CatalogResourceProof | undefined,
): Promise<PreparedCatalog | null>
async function prepareResolvedCatalog(
  source: Awaited<ReturnType<typeof resolveSourceRevision>>,
  base: GameDataSourceStack['base'] | undefined,
  signal: AbortSignal,
  onProgress?: DataLoaderOptions['onProgress'],
  read?: ReadSourceJson,
  priorProof?: CatalogResourceProof,
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
  const identity = base ? { base, additional: admitted } : admitted
  const issues: string[] = []
  const assertRequiredResources = () => {
    if (issues.length)
      throw new CatalogCheckError(`Could not load required game data. ${issues[0]}`, issues)
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
      } else if (fromBase || !missing) {
        scan.warnings.push(message)
        if (!missing) scan.unavailable.push(file)
      }
    },
  }
  const load = base
    ? loadGameDataSourceStack(
        { base, additional: admitted },
        {
          ...options,
          onOptionalDependency,
          baseReader: read ? createJsonResourceReader(base, read) : undefined,
          additionalReader: scan.reader,
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
    : loadDataFromSource(admitted, options, scan.reader)
  const loaded = await settleOnAbort(load, signal)
  assertRequiredResources()
  // Exact feature targets can live in a different indexed document in the same source.
  const data = base ? loaded : composeGameDataLayers([loaded])
  if (!base) assertLayerDependencies(data, loaded, undefined, onOptionalDependency)
  const magicIssue = data.magicVariantDiagnostics?.find(
    ({ message }) => !message.startsWith('Reference collides'),
  )
  if (magicIssue) throw new Error(`${magicIssue.path}: ${magicIssue.message}`)
  const missingSpell = getMissingSubclassSpell(data, additional ?? loaded)
  if (missingSpell)
    throw new CatalogCheckError(
      `${describeCatalogReference(missingSpell.owner)} needs the spell ${describeCatalogReference(missingSpell.spell)}. Include that spell and check again.`,
      [`${missingSpell.owner} needs ${missingSpell.spell}`],
    )
  const supplied = additional ?? loaded
  const keys = externalCatalogKeys(supplied)
  if (!keys.length) throw new Error('The additional source has no usable game data.')
  const suppliedItems = getRawItems(supplied)
  const contents = describeCatalogContents(
    suppliedItems.items.length === supplied.items.length &&
      suppliedItems.itemsBase.length === supplied.itemsBase.length
      ? keys
      : externalCatalogKeys({ ...supplied, ...suppliedItems }),
    getLoadedRaceData(supplied),
  )
  admitted.resourceProof =
    scan.warnings.length || scan.unavailable.length ? undefined : observation?.proof()
  return {
    config: admitted,
    identity,
    data,
    keys,
    warnings: scan.warnings,
    contents,
    ...(dependencyWarnings.size ? { dependencyWarnings: [...dependencyWarnings] } : {}),
    ...(scan.unavailable.length ? { unavailableResources: scan.unavailable } : {}),
    revision: source.revision,
    layerMetadata,
  }
}
