import { del, get, set } from 'idb-keyval'
import type { DataSourceConfig, GameData } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface GameDataCacheEntry {
  data: GameData
  cachedAt: string
  contentFingerprint?: string
  lastDataChangedAt?: string
  sourceSnapshot: { type: string; path: string }
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
    return (await get<GameDataCacheEntry>(CACHE_KEY)) ?? null
  } catch {
    return null
  }
}

export async function writeGameDataCache(
  data: GameData,
  config: DataSourceConfig,
  fallback?: { fingerprint?: string | null; lastDataChangedAt?: string | null },
): Promise<GameDataCacheEntry> {
  const now = new Date().toISOString()
  const contentFingerprint = computeContentFingerprint(data)
  const previous = await readGameDataCache()
  const previousFingerprint =
    previous && isCacheForSource(previous, config)
      ? (previous.contentFingerprint ?? computeContentFingerprint(previous.data))
      : null

  let lastDataChangedAt: string
  if (previous && previousFingerprint != null && previousFingerprint === contentFingerprint) {
    // Same source and same content in the existing cache — data hasn't changed.
    lastDataChangedAt = previous.lastDataChangedAt ?? previous.cachedAt
  } else if (
    isCacheForSource(
      previous ??
        ({ sourceSnapshot: { type: config.type, path: config.path } } as GameDataCacheEntry),
      config,
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
    cachedAt: now,
    contentFingerprint,
    lastDataChangedAt,
    sourceSnapshot: { type: config.type, path: config.path },
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

export function isCacheForSource(entry: GameDataCacheEntry, config: DataSourceConfig): boolean {
  return entry.sourceSnapshot.type === config.type && entry.sourceSnapshot.path === config.path
}
