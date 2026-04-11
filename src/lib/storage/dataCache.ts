import { del, get, set } from 'idb-keyval'
import type { DataSourceConfig, GameData } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface GameDataCacheEntry {
  data: GameData
  cachedAt: string
  /** Hash of parsed game data content used to detect actual data changes. */
  contentFingerprint?: string
  /** Last time fetched content differed from previous cached content. */
  lastDataChangedAt?: string
  /** Minimal source config snapshot — enough to detect source changes. */
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

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(',')}}`
}

function computeContentFingerprint(data: GameData): string {
  const { lookups: _lookups, ...fingerprintData } = data as GameData & {
    lookups?: unknown
  }
  return hashStringFnv1a(stableSerialize(fingerprintData))
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
): Promise<GameDataCacheEntry> {
  const now = new Date().toISOString()
  const contentFingerprint = computeContentFingerprint(data)
  const previous = await readGameDataCache()

  const lastDataChangedAt =
    previous &&
    isCacheForSource(previous, config) &&
    previous.contentFingerprint === contentFingerprint
      ? (previous.lastDataChangedAt ?? previous.cachedAt)
      : now

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
