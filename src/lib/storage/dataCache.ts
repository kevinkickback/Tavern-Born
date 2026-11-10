import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { createStore, delMany, get, getMany } from 'idb-keyval'
import { settleOnAbort } from '@/lib/abortable'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
const CACHE_GENERATION_KEY = 'tb:game-data-cache-generation'
export const GAME_DATA_SETTINGS_KEY = 'game-data-storage'
export const GAME_DATA_STORE_VERSION = 1
export const GAME_DATA_CACHE_SCHEMA_VERSION = 95
let abortableCacheStore: ReturnType<typeof createStore> | undefined

export interface GameDataCacheEntry {
  generation?: string
  data: GameData
  cacheSchemaVersion?: number
  cachedAt: string
  contentFingerprint?: string
  lastDataChangedAt?: string
  sourceSnapshot: DataSourceSnapshot
  externalKeys?: string[]
}

export type GameDataCacheMetadata = Omit<GameDataCacheEntry, 'data'>
type LegacyCacheIdentity = Pick<
  GameDataCacheMetadata,
  'cachedAt' | 'contentFingerprint' | 'sourceSnapshot'
>
type LegacyCacheStamp = LegacyCacheIdentity & { generation: string }

export function cacheMetadata({
  data: _data,
  ...metadata
}: GameDataCacheEntry): GameDataCacheMetadata {
  return metadata
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

export function computeGameDataFingerprint(data: GameData): string {
  // Exclude runtime-only lookups from fingerprint. Sort top-level keys before
  // serializing to guard against insertion-order differences across parser versions.
  const { lookups: _lookups, ...fingerprintData } = data as GameData & {
    lookups?: unknown
  }
  const sorted = Object.fromEntries(
    Object.entries(fingerprintData).sort(([a], [b]) => a.localeCompare(b)),
  )
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(sorted))))
}

function usableCache(entry?: GameDataCacheEntry | null): GameDataCacheEntry | null {
  return entry?.cacheSchemaVersion === GAME_DATA_CACHE_SCHEMA_VERSION &&
    entry.sourceSnapshot &&
    Array.isArray(entry.data?.classes) &&
    Array.isArray(entry.data?.spells)
    ? entry
    : null
}

export async function readGameDataCache(): Promise<GameDataCacheEntry | null> {
  try {
    return usableCache(await get<GameDataCacheEntry>(CACHE_KEY))
  } catch {
    return null
  }
}

export async function readGameDataCachePair() {
  const [value, persisted, stamp] = await getMany([
    CACHE_KEY,
    GAME_DATA_SETTINGS_KEY,
    CACHE_GENERATION_KEY,
  ])
  const cache = usableCache(value)
  if (
    cache &&
    !cache.generation &&
    stamp &&
    typeof stamp !== 'string' &&
    sameLegacyCache(stamp, cache)
  )
    cache.generation = stamp.generation
  const settings = persisted?.state as
    | {
        dataSourceConfig?: DataSourceConfig | null
        lastUpdateCheckAt?: string | null
      }
    | undefined
  return { cache, settings }
}

function writeBeforeAbort(
  signal: AbortSignal,
  write: (store: IDBObjectStore, done: (applied: boolean) => void) => void,
): Promise<boolean> {
  // Use the same database and store as idb-keyval's default get/set/del.
  abortableCacheStore ??= createStore('keyval-store', 'keyval')
  let transactionAttached = false
  const pending = abortableCacheStore('readwrite', (store) => {
    signal.throwIfAborted()
    transactionAttached = true
    const transaction = store.transaction
    return new Promise<boolean>((resolve, reject) => {
      let applied = false
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
        resolve(applied)
      }
      transaction.onabort = () => {
        cleanup()
        reject(signal.reason ?? transaction.error ?? new Error('Cache write aborted.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      try {
        write(store, (result) => {
          applied = result
        })
      } catch (error) {
        transaction.abort()
        cleanup()
        reject(error)
      }
    })
  })
  return settleOnAbort(pending, signal, () => !transactionAttached)
}

function putSettings(
  store: IDBObjectStore,
  config: DataSourceConfig,
  entry: GameDataCacheMetadata,
  lastUpdateCheckAt = entry.cachedAt,
) {
  store.put(
    {
      version: GAME_DATA_STORE_VERSION,
      state: {
        dataSourceConfig: config,
        lastUpdateCheckAt,
        lastContentFingerprint: entry.contentFingerprint,
        lastDataChangedAt: entry.lastDataChangedAt,
      },
    },
    GAME_DATA_SETTINGS_KEY,
  )
}

function sameLegacyCache(current: LegacyCacheIdentity, expected: LegacyCacheIdentity) {
  return (
    current.cachedAt === expected.cachedAt &&
    current.contentFingerprint === expected.contentFingerprint &&
    JSON.stringify(current.sourceSnapshot) === JSON.stringify(expected.sourceSnapshot)
  )
}

function ifCurrentCache(
  store: IDBObjectStore,
  expected: GameDataCacheMetadata,
  write: (generation?: string) => void,
) {
  const read = store.get(CACHE_GENERATION_KEY)
  read.onsuccess = () => {
    const stamp = read.result as string | LegacyCacheStamp | undefined
    const generation = typeof stamp === 'string' ? stamp : stamp?.generation
    if (expected.generation) {
      if (generation === expected.generation) write(generation)
      return
    }
    if (stamp) {
      if (typeof stamp !== 'string' && sameLegacyCache(stamp, expected)) write(stamp.generation)
      return
    }

    // Adopt pre-worker caches once, without rewriting their catalog data.
    const legacy = store.get(CACHE_KEY)
    legacy.onsuccess = () => {
      const current = legacy.result as GameDataCacheEntry | undefined
      if (current && !current.generation && sameLegacyCache(current, expected)) write()
    }
  }
}

export async function markCatalogChecked(
  entry: GameDataCacheMetadata,
  config: DataSourceConfig,
  checkedAt: string,
  signal: AbortSignal,
) {
  let generation: string | undefined
  const written = await writeBeforeAbort(signal, (store, done) => {
    ifCurrentCache(store, entry, (current) => {
      generation = current ?? crypto.randomUUID()
      if (!current) {
        const { cachedAt, contentFingerprint, sourceSnapshot } = entry
        store.put(
          { generation, cachedAt, contentFingerprint, sourceSnapshot } satisfies LegacyCacheStamp,
          CACHE_GENERATION_KEY,
        )
      }
      putSettings(store, config, entry, checkedAt)
      done(true)
    })
  })
  return written ? generation : undefined
}

export async function persistCatalogRepair(
  entry: GameDataCacheEntry,
  result: Pick<GameDataCacheEntry, 'data' | 'contentFingerprint'>,
  signal: AbortSignal,
): Promise<GameDataCacheEntry | null> {
  const repaired = { ...entry, ...result, generation: crypto.randomUUID() }
  const written = await writeBeforeAbort(signal, (store, done) => {
    ifCurrentCache(store, entry, () => {
      store.put(repaired, CACHE_KEY)
      store.put(repaired.generation, CACHE_GENERATION_KEY)
      done(true)
    })
  })
  return written ? repaired : null
}

export async function writeGameDataCache(
  data: GameData,
  identity: GameDataCacheIdentity,
  options?: {
    fingerprint?: string | null
    lastDataChangedAt?: string | null
    layerMetadata?: GameDataLayerCacheMetadataByRole
    signal?: AbortSignal
    config?: DataSourceConfig
    externalKeys?: string[]
    contentFingerprint?: string
    previous?: GameDataCacheMetadata | null
  },
): Promise<GameDataCacheEntry> {
  options?.signal?.throwIfAborted()
  const now = new Date().toISOString()
  const contentFingerprint = options?.contentFingerprint ?? computeGameDataFingerprint(data)
  const existing =
    options?.previous === undefined ? readGameDataCache() : Promise.resolve(options.previous)
  const previous = await (options?.signal ? settleOnAbort(existing, options.signal) : existing)
  const sameSource = previous !== null && isCacheForSource(previous, identity)
  const previousFingerprint = sameSource
    ? previous.contentFingerprint?.length === 64
      ? previous.contentFingerprint
      : 'data' in previous
        ? computeGameDataFingerprint(previous.data as GameData)
        : null
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
    generation: crypto.randomUUID(),
    data,
    cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION,
    cachedAt: now,
    contentFingerprint,
    lastDataChangedAt,
    sourceSnapshot: createSourceSnapshot(identity, options?.layerMetadata),
    externalKeys: options?.externalKeys,
  }

  // A timed-out or superseded startup must fail before starting the atomic write.
  options?.signal?.throwIfAborted()
  await writeBeforeAbort(options?.signal ?? new AbortController().signal, (store, done) => {
    store.put(entry, CACHE_KEY)
    store.put(entry.generation, CACHE_GENERATION_KEY)
    if (options?.config) putSettings(store, options.config, entry)
    done(true)
  })
  return entry
}

export async function clearGameDataCache(clearSettings = false): Promise<void> {
  await delMany([
    CACHE_KEY,
    CACHE_GENERATION_KEY,
    ...(clearSettings ? [GAME_DATA_SETTINGS_KEY] : []),
  ])
}

export function isCacheForSource(
  entry: Pick<GameDataCacheEntry, 'sourceSnapshot'>,
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
