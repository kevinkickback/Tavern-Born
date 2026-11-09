import { settleOnAbort } from '@/lib/abortable'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  computeGameDataFingerprint,
  type GameDataLayerCacheMetadataByRole,
} from '@/lib/storage/dataCache'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import {
  assertLayerDependencies,
  externalCatalogKeys,
  loadGameDataSourceStack,
} from './contentLayers'
import type { DataLoaderOptions } from './dataLoader'
import { loadDataFromSource } from './dataLoader'
import { createJsonResourceReader } from './resourceReader'
import { resolveSourceRevision } from './sourceRevision'
import { inspectCatalogResources } from './validator'

export interface PreparedCatalog {
  config: Exclude<DataSourceConfig, { type: 'bundled' }>
  identity: GameDataSourceStack | DataSourceConfig
  data: GameData
  keys: string[]
  warnings: string[]
  revision?: string
  layerMetadata?: GameDataLayerCacheMetadataByRole
}

function getMissingSubclassSpell(data: GameData, additional: GameData) {
  const available = new Set(
    data.spells
      .filter((spell) => (spell.classSpellRouteSource?.input.targetOccurrences.length ?? 1) === 1)
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
          if (missing) return `${subclass.name}|${subclass.source} needs ${missing}`
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
): Promise<PreparedCatalog> {
  onProgress?.(0, 0, 'Checking source')
  const source = await resolveSourceRevision(config, signal)
  const reader = createJsonResourceReader(source.readConfig)
  const scan = await settleOnAbort(
    inspectCatalogResources(reader, config.availableResources ?? [], signal),
    signal,
  )
  const admitted = { ...source.config, isValid: true, availableResources: scan.resources }
  const identity = base ? { base, additional: admitted } : admitted
  const issues: string[] = []
  let additional: GameData | undefined
  const layerMetadata: GameDataLayerCacheMetadataByRole = {}
  const options = {
    signal,
    strictCandidate: true,
    onProgress,
    onResourceFailure: (resource: string, failure: { required: boolean; cause?: unknown }) => {
      const detail = failure.cause instanceof Error ? ` — ${failure.cause.message}` : ''
      const message = `${resource}${detail}`
      if (
        failure.required ||
        (resource.endsWith('book/book-tce.json') &&
          config.availableResources?.includes('book/book-tce.json'))
      ) {
        issues.push(message)
      } else scan.warnings.push(message)
    },
  }
  const load = base
    ? loadGameDataSourceStack(
        { base, additional: admitted },
        {
          ...options,
          additionalReader: scan.reader,
          onLayerLoaded: (role, data) => {
            if (role === 'additional') additional = data
            layerMetadata[role] = {
              contentFingerprint: computeGameDataFingerprint(data),
              entityCount: externalCatalogKeys(data).length,
            }
          },
        },
      )
    : loadDataFromSource(admitted, options, scan.reader)
  const data = await settleOnAbort(load, signal)
  if (issues.length) throw new Error(`Could not load required game data. ${issues.join('; ')}`)
  if (!base) assertLayerDependencies(data, data)
  const magicIssue = data.magicVariantDiagnostics?.find(
    ({ message }) => !message.startsWith('Reference collides'),
  )
  if (magicIssue) throw new Error(`${magicIssue.path}: ${magicIssue.message}`)
  const missingSpell = getMissingSubclassSpell(data, additional ?? data)
  if (missingSpell) throw new Error(missingSpell)
  const keys = externalCatalogKeys(additional ?? data)
  if (!keys.length) throw new Error('The additional source has no usable game data.')
  return {
    config: admitted,
    identity,
    data,
    keys,
    warnings: scan.warnings,
    revision: source.revision,
    layerMetadata,
  }
}
