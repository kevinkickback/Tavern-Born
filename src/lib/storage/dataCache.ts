import { createStore, del, get, set } from 'idb-keyval'
import { settleOnAbort } from '@/lib/abortable'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
export const GAME_DATA_CACHE_SCHEMA_VERSION = 78
const MAX_AGE_MS = 24 * 60 * 60 * 1000
let abortableCacheStore: ReturnType<typeof createStore> | undefined

export interface GameDataCacheEntry {
  data: GameData
  cacheSchemaVersion?: number
  cachedAt: string
  contentFingerprint?: string
  lastDataChangedAt?: string
  sourceSnapshot: DataSourceSnapshot
}

interface SourceLayerSnapshot {
  role: 'base' | 'additional'
  type: DataSourceConfig['type']
  path: string
  packId?: string
  packVersion?: string
  resources?: string[]
  contentFingerprint?: string
  entityCount?: number
}

interface DataSourceSnapshot {
  type: string
  path: string
  packId?: string
  packVersion?: string
  resources?: string[]
  layers?: SourceLayerSnapshot[]
}

export type GameDataCacheIdentity = DataSourceConfig | GameDataSourceStack

interface GameDataLayerCacheMetadata {
  contentFingerprint: string
  entityCount: number
}

export type GameDataLayerCacheMetadataByRole = Partial<
  Record<SourceLayerSnapshot['role'], GameDataLayerCacheMetadata>
>

function isSourceStack(identity: GameDataCacheIdentity): identity is GameDataSourceStack {
  return 'base' in identity
}

function snapshotConfig(
  config: DataSourceConfig,
  role: SourceLayerSnapshot['role'],
  metadata?: GameDataLayerCacheMetadata,
): SourceLayerSnapshot {
  return {
    role,
    type: config.type,
    path: config.path,
    ...(config.type === 'bundled'
      ? { packId: config.packId, packVersion: config.packVersion }
      : config.availableResources
        ? { resources: [...new Set(config.availableResources)].sort() }
        : {}),
    ...metadata,
  }
}

function createSourceSnapshot(
  identity: GameDataCacheIdentity,
  layerMetadata?: GameDataLayerCacheMetadataByRole,
): DataSourceSnapshot {
  if (!isSourceStack(identity)) {
    return {
      type: identity.type,
      path: identity.path,
      ...(identity.type === 'bundled'
        ? { packId: identity.packId, packVersion: identity.packVersion }
        : identity.availableResources
          ? { resources: [...new Set(identity.availableResources)].sort() }
          : {}),
    }
  }

  const active = identity.additional ?? identity.base
  return {
    type: active.type,
    path: active.path,
    ...(active.type === 'bundled'
      ? { packId: active.packId, packVersion: active.packVersion }
      : {}),
    layers: [
      snapshotConfig(identity.base, 'base', layerMetadata?.base),
      ...(identity.additional
        ? [snapshotConfig(identity.additional, 'additional', layerMetadata?.additional)]
        : []),
    ],
  }
}

function hashStringFnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function computeGameDataFingerprint(data: GameData): string {
  // Exclude runtime-only lookups from fingerprint. Sort top-level keys before
  // serializing to guard against insertion-order differences across parser versions.
  const { lookups: _lookups, ...fingerprintData } = data as GameData & {
    lookups?: unknown
  }
  const sorted = Object.fromEntries(
    Object.entries(fingerprintData).sort(([a], [b]) => a.localeCompare(b)),
  )
  return hashStringFnv1a(JSON.stringify(sorted))
}

export async function readGameDataCache(): Promise<GameDataCacheEntry | null> {
  try {
    const entry = (await get<GameDataCacheEntry>(CACHE_KEY)) ?? null
    return entry?.cacheSchemaVersion === GAME_DATA_CACHE_SCHEMA_VERSION ? entry : null
  } catch {
    return null
  }
}

function writeCacheBeforeAbort(entry: GameDataCacheEntry, signal: AbortSignal): Promise<void> {
  // Use the same database and store as idb-keyval's default get/set/del.
  abortableCacheStore ??= createStore('keyval-store', 'keyval')
  let transactionAttached = false
  const pending = abortableCacheStore('readwrite', (store) => {
    signal.throwIfAborted()
    transactionAttached = true
    const transaction = store.transaction
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        try {
          transaction.abort()
        } catch (error) {
          // The transaction can already be finished while its event is queued.
          if (!(error instanceof DOMException && error.name === 'InvalidStateError')) reject(error)
        }
      }
      const cleanup = () => signal.removeEventListener('abort', abort)
      transaction.oncomplete = () => {
        cleanup()
        resolve()
      }
      transaction.onabort = () => {
        cleanup()
        reject(signal.reason ?? transaction.error ?? new Error('Cache write aborted.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        store.put(entry, CACHE_KEY)
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
  })
  return settleOnAbort(pending, signal, () => !transactionAttached)
}

export async function writeGameDataCache(
  data: GameData,
  identity: GameDataCacheIdentity,
  options?: {
    fingerprint?: string | null
    lastDataChangedAt?: string | null
    layerMetadata?: GameDataLayerCacheMetadataByRole
    signal?: AbortSignal
    beforeWrite?: () => void
  },
): Promise<GameDataCacheEntry> {
  options?.signal?.throwIfAborted()
  const now = new Date().toISOString()
  const contentFingerprint = computeGameDataFingerprint(data)
  const existing = readGameDataCache()
  const previous = await (options?.signal ? settleOnAbort(existing, options.signal) : existing)
  const sameSource = previous !== null && isCacheForSource(previous, identity)
  const previousFingerprint = sameSource
    ? (previous.contentFingerprint ?? computeGameDataFingerprint(previous.data))
    : null

  let lastDataChangedAt: string
  if (previous && previousFingerprint === contentFingerprint) {
    lastDataChangedAt = previous.lastDataChangedAt ?? previous.cachedAt
  } else if (
    (!previous || sameSource) &&
    options?.fingerprint === contentFingerprint &&
    options.lastDataChangedAt != null
  ) {
    // The store can remember a fingerprint and date after the cache has been cleared.
    lastDataChangedAt = options.lastDataChangedAt
  } else {
    lastDataChangedAt = now
  }

  const entry: GameDataCacheEntry = {
    data,
    cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION,
    cachedAt: now,
    contentFingerprint,
    lastDataChangedAt,
    sourceSnapshot: createSourceSnapshot(identity, options?.layerMetadata),
  }

  // A timed-out or superseded startup must fail before starting the atomic write.
  options?.signal?.throwIfAborted()
  options?.beforeWrite?.()
  if (options?.signal) await writeCacheBeforeAbort(entry, options.signal)
  else await set(CACHE_KEY, entry)
  return entry
}

export async function clearGameDataCache(): Promise<void> {
  await del(CACHE_KEY)
}

export function isCacheStale(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() > MAX_AGE_MS
}

export function isCacheForSource(
  entry: GameDataCacheEntry,
  identity: GameDataCacheIdentity,
): boolean {
  const expected = createSourceSnapshot(identity)
  if (entry.sourceSnapshot.type !== expected.type || entry.sourceSnapshot.path !== expected.path) {
    return false
  }
  if (
    entry.sourceSnapshot.packId !== expected.packId ||
    entry.sourceSnapshot.packVersion !== expected.packVersion ||
    JSON.stringify(entry.sourceSnapshot.resources) !== JSON.stringify(expected.resources)
  ) {
    return false
  }

  if (!expected.layers) return entry.sourceSnapshot.layers == null
  if (
    !entry.sourceSnapshot.layers ||
    entry.sourceSnapshot.layers.length !== expected.layers.length
  ) {
    return false
  }
  return expected.layers.every((layer, index) => {
    const cachedLayer = entry.sourceSnapshot.layers?.[index]
    return (
      cachedLayer?.role === layer.role &&
      cachedLayer.type === layer.type &&
      cachedLayer.path === layer.path &&
      cachedLayer.packId === layer.packId &&
      cachedLayer.packVersion === layer.packVersion &&
      JSON.stringify(cachedLayer.resources) === JSON.stringify(layer.resources)
    )
  })
}
