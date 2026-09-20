import { del, get, set } from 'idb-keyval'
import type { DataSourceConfig, GameData, GameDataSourceStack } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
export const GAME_DATA_CACHE_SCHEMA_VERSION = 10
const MAX_AGE_MS = 24 * 60 * 60 * 1000

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

function isSourceStack(identity: GameDataCacheIdentity): identity is GameDataSourceStack {
  return 'base' in identity
}

function snapshotConfig(
  config: DataSourceConfig,
  role: SourceLayerSnapshot['role'],
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
  }
}

function createSourceSnapshot(identity: GameDataCacheIdentity): DataSourceSnapshot {
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
      snapshotConfig(identity.base, 'base'),
      ...(identity.additional ? [snapshotConfig(identity.additional, 'additional')] : []),
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

function computeContentFingerprint(data: GameData): string {
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

export async function writeGameDataCache(
  data: GameData,
  identity: GameDataCacheIdentity,
  fallback?: { fingerprint?: string | null; lastDataChangedAt?: string | null },
): Promise<GameDataCacheEntry> {
  const now = new Date().toISOString()
  const contentFingerprint = computeContentFingerprint(data)
  const previous = await readGameDataCache()
  const previousFingerprint =
    previous && isCacheForSource(previous, identity)
      ? (previous.contentFingerprint ?? computeContentFingerprint(previous.data))
      : null

  let lastDataChangedAt: string
  if (previous && previousFingerprint != null && previousFingerprint === contentFingerprint) {
    // Same source and same content in the existing cache — data hasn't changed.
    lastDataChangedAt = previous.lastDataChangedAt ?? previous.cachedAt
  } else if (
    isCacheForSource(
      previous ?? ({ sourceSnapshot: createSourceSnapshot(identity) } as GameDataCacheEntry),
      identity,
    ) &&
    fallback?.fingerprint != null &&
    fallback.fingerprint === contentFingerprint &&
    fallback.lastDataChangedAt != null
  ) {
    // Either: cache was cleared (no previous), or previous cache exists but lacks a
    // fingerprint (pre-fingerprinting cache). In both cases the store's persisted
    // fingerprint matches the new content — data hasn't actually changed.
    lastDataChangedAt = fallback.lastDataChangedAt
  } else {
    lastDataChangedAt = now
  }

  const entry: GameDataCacheEntry = {
    data,
    cacheSchemaVersion: GAME_DATA_CACHE_SCHEMA_VERSION,
    cachedAt: now,
    contentFingerprint,
    lastDataChangedAt,
    sourceSnapshot: createSourceSnapshot(identity),
  }

  await set(CACHE_KEY, entry)
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
