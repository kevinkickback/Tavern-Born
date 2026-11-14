import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { createStore, delMany, get, getMany, set } from 'idb-keyval'
import type { CatalogRefreshCheck } from '@/lib/5etools/catalogRefreshPolicy'
import { settleOnAbort } from '@/lib/abortable'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
const CACHE_GENERATION_KEY = 'tb:game-data-cache-generation'
const REFRESH_CHECK_KEY = 'tb:game-data-refresh-check'
const PREVIOUS_CACHE_KEY = 'tb:game-data-previous-cache'
const PREVIOUS_INFO_KEY = 'tb:game-data-previous-info'
const CHARACTER_LIBRARY_KEY = 'character-storage'
export const GAME_DATA_SETTINGS_KEY = 'game-data-storage'
export const GAME_DATA_STORE_VERSION = 1
export const GAME_DATA_CACHE_SCHEMA_VERSION = 106
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
export interface PreviousCatalog {
  cache: GameDataCacheMetadata
  config: DataSourceConfig
  lastCheckedAt?: string
}

export function isPreviousCatalogCompatible(
  previous: PreviousCatalog,
  installed: Extract<DataSourceConfig, { type: 'bundled' }> | null,
): boolean {
  const { cache, config } = previous
  if (
    cache?.cacheSchemaVersion !== GAME_DATA_CACHE_SCHEMA_VERSION ||
    !cache.sourceSnapshot ||
    !config
  )
    return false
  if (config.type === 'bundled') return !!installed && isCacheForSource(cache, installed)
  return isCacheForSource(cache, installed ? { base: installed, additional: config } : config)
}
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

export async function readCatalogExpectation(): Promise<GameDataCacheMetadata | null> {
  const [value, stamp] = await getMany([CACHE_KEY, CACHE_GENERATION_KEY])
  return catalogExpectation(value, stamp)
}

/** Read rejected cache data as comparison evidence only. It cannot become the active catalog. */
export async function readAcceptedCatalogForComparison(expected: GameDataCacheMetadata) {
  const [entry, stamp, library] = await getMany([
    CACHE_KEY,
    CACHE_GENERATION_KEY,
    CHARACTER_LIBRARY_KEY,
  ])
  const current = catalogExpectation(entry, stamp)
  const generation = typeof stamp === 'string' ? stamp : stamp?.generation
  if (
    !expected.generation ||
    generation !== expected.generation ||
    current?.generation !== expected.generation ||
    !sameLegacyCache(current, expected) ||
    (library &&
      (!Array.isArray(library.state?.characters) || library.state.unsupportedCharacters?.length))
  )
    return
  return {
    data: (entry as GameDataCacheEntry).data,
    characters: library?.state?.characters ?? [],
    characterLibrary: JSON.stringify(library ?? null),
  }
}

export class CatalogRestoreLibraryChanged extends Error {}

function catalogExpectation(value?: GameDataCacheEntry, stamp?: string | LegacyCacheStamp) {
  if (!value) return null
  const metadata = cacheMetadata(value)
  if (
    !metadata.generation &&
    stamp &&
    typeof stamp !== 'string' &&
    sameLegacyCache(stamp, metadata)
  )
    metadata.generation = stamp.generation
  return metadata
}

export async function readGameDataCachePair() {
  const [value, persisted, stamp, refreshCheck, previous] = await getMany([
    CACHE_KEY,
    GAME_DATA_SETTINGS_KEY,
    CACHE_GENERATION_KEY,
    REFRESH_CHECK_KEY,
    PREVIOUS_INFO_KEY,
  ])
  const cache = usableCache(value)
  const expectedCache = catalogExpectation(value, stamp)
  if (cache && expectedCache?.generation) cache.generation = expectedCache.generation
  const settings = persisted?.state as
    | {
        dataSourceConfig?: DataSourceConfig | null
        lastUpdateCheckAt?: string | null
        lastContentFingerprint?: string | null
      }
    | undefined
  return {
    cache,
    settings,
    refreshCheck: refreshCheck as CatalogRefreshCheck | undefined,
    expectedCache,
    ...(previous ? { previous: previous as PreviousCatalog } : {}),
  }
}

export async function writeCatalogRefreshCheck(
  check: CatalogRefreshCheck,
  expected?: GameDataCacheMetadata | null,
): Promise<void> {
  if (expected === undefined) return set(REFRESH_CHECK_KEY, check)
  await writeBeforeAbort(new AbortController().signal, (store, done) => {
    const save = () => {
      store.put(check, REFRESH_CHECK_KEY)
      done(true)
    }
    if (expected) ifCurrentCache(store, expected, save)
    else withExpectedCatalog(store, null, save)
  })
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

function withExpectedCatalog(
  store: IDBObjectStore,
  expected: GameDataCacheMetadata | null,
  read: (entry: GameDataCacheEntry | undefined) => void,
) {
  const inspect = () => {
    const current = store.get(CACHE_KEY)
    current.onsuccess = () => {
      const entry = current.result as GameDataCacheEntry | undefined
      if (
        expected === null
          ? !entry
          : entry &&
            (entry.generation
              ? entry.generation === expected.generation
              : sameLegacyCache(entry, expected))
      )
        read(entry)
    }
  }
  if (expected) ifCurrentCache(store, expected, inspect)
  else inspect()
}

function putAcceptedCatalog(
  store: IDBObjectStore,
  entry: GameDataCacheEntry,
  config: DataSourceConfig,
  lastCheckedAt?: string,
) {
  store.put(entry, CACHE_KEY)
  store.put(entry.generation, CACHE_GENERATION_KEY)
  store.delete(REFRESH_CHECK_KEY)
  putSettings(store, config, entry, lastCheckedAt)
}

export async function restorePreviousCatalog(
  previous: PreviousCatalog,
  expected: GameDataCacheMetadata | null,
  signal: AbortSignal,
) {
  let restored: GameDataCacheEntry | undefined
  const written = await writeBeforeAbort(signal, (store, done) => {
    withExpectedCatalog(store, expected, () => {
      const infoRead = store.get(PREVIOUS_INFO_KEY)
      infoRead.onsuccess = () => {
        const info = infoRead.result as PreviousCatalog | undefined
        if (!info?.cache?.generation || info.cache.generation !== previous.cache.generation) return
        if (!sameLegacyCache(info.cache, previous.cache)) return
        if (JSON.stringify(info.config) !== JSON.stringify(previous.config)) return
        if (info.lastCheckedAt !== previous.lastCheckedAt) return
        const read = store.get(PREVIOUS_CACHE_KEY)
        read.onsuccess = () => {
          const old = usableCache(read.result)
          if (!old || old.generation !== info.cache.generation || !sameLegacyCache(old, info.cache))
            return
          restored = { ...old, generation: crypto.randomUUID() }
          store.delete(PREVIOUS_CACHE_KEY)
          store.delete(PREVIOUS_INFO_KEY)
          putAcceptedCatalog(store, restored, info.config, info.lastCheckedAt)
          done(true)
        }
      }
    })
  })
  if (!written || !restored)
    throw new Error('The saved game data changed. Restart to load the current catalog.')
  return restored
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
    expectedCache?: GameDataCacheMetadata | null
    characterLibrary?: string
    onPrevious?: (previous: PreviousCatalog | undefined) => void
  },
): Promise<GameDataCacheEntry> {
  options?.signal?.throwIfAborted()
  const now = new Date().toISOString()
  const contentFingerprint = options?.contentFingerprint ?? computeGameDataFingerprint(data)
  const existing =
    options?.previous === undefined ? readGameDataCache() : Promise.resolve(options.previous)
  const stored = await (options?.signal ? settleOnAbort(existing, options.signal) : existing)
  const previous =
    stored?.cacheSchemaVersion === GAME_DATA_CACHE_SCHEMA_VERSION && stored.sourceSnapshot
      ? stored
      : null
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
  let backup: PreviousCatalog | undefined
  let libraryChanged = false
  const written = await writeBeforeAbort(
    options?.signal ?? new AbortController().signal,
    (store, done) => {
      const config = options?.config
      if (config && options.expectedCache !== undefined) {
        withExpectedCatalog(store, options.expectedCache, (current) => {
          const activate = (priorConfig: DataSourceConfig | undefined, lastCheckedAt?: string) => {
            if (usableCache(current) && current && priorConfig) {
              const installed = isSourceStack(identity)
                ? identity.base
                : identity.type === 'bundled'
                  ? identity
                  : null
              if (
                isPreviousCatalogCompatible({ cache: current, config: priorConfig }, installed) &&
                (current.contentFingerprint !== entry.contentFingerprint ||
                  JSON.stringify(current.sourceSnapshot) !== JSON.stringify(entry.sourceSnapshot) ||
                  JSON.stringify(current.externalKeys) !== JSON.stringify(entry.externalKeys))
              ) {
                const old = { ...current, generation: crypto.randomUUID() }
                backup = {
                  cache: cacheMetadata(old),
                  config: priorConfig,
                  lastCheckedAt,
                }
                store.put(old, PREVIOUS_CACHE_KEY)
                store.put(backup, PREVIOUS_INFO_KEY)
              }
            }
            putAcceptedCatalog(store, entry, config)
            done(true)
          }
          const readSettings = () => {
            const settings = store.get(GAME_DATA_SETTINGS_KEY)
            settings.onsuccess = () =>
              activate(
                settings.result?.state?.dataSourceConfig,
                settings.result?.state?.lastUpdateCheckAt,
              )
          }
          if (options.characterLibrary === undefined) {
            readSettings()
          } else {
            const library = store.get(CHARACTER_LIBRARY_KEY)
            library.onsuccess = () => {
              libraryChanged = JSON.stringify(library.result ?? null) !== options.characterLibrary
              if (libraryChanged) done(false)
              else readSettings()
            }
          }
        })
        return
      }
      store.put(entry, CACHE_KEY)
      store.put(entry.generation, CACHE_GENERATION_KEY)
      if (options?.config) {
        store.delete(REFRESH_CHECK_KEY)
        putSettings(store, options.config, entry)
      }
      done(true)
    },
  )
  if (libraryChanged) throw new CatalogRestoreLibraryChanged()
  if (!written) throw new Error('The saved game data changed. Restart to load the current catalog.')
  if (backup) options?.onPrevious?.(backup)
  return entry
}

export async function clearGameDataCache(clearSettings = false): Promise<void> {
  await delMany([
    CACHE_KEY,
    CACHE_GENERATION_KEY,
    PREVIOUS_CACHE_KEY,
    PREVIOUS_INFO_KEY,
    ...(clearSettings ? [GAME_DATA_SETTINGS_KEY, REFRESH_CHECK_KEY] : []),
  ])
}

export function isCacheForSource(
  entry: Pick<GameDataCacheEntry, 'sourceSnapshot'>,
  identity: GameDataCacheIdentity,
): boolean {
  if (!entry.sourceSnapshot) return false
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
