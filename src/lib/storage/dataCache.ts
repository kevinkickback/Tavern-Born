// IDB cache for parsed GameData.
// Stores one entry keyed by CACHE_KEY that includes the data, when it was
// fetched, and which source config it came from.  This lets the app start
// instantly on subsequent launches without hitting the network / disk again.

import { get, set, del } from 'idb-keyval'
import type { GameData, DataSourceConfig } from '@/types/5etools'

const CACHE_KEY = 'tb:game-data-cache'
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface GameDataCacheEntry {
    data: GameData
    cachedAt: string
    /** Minimal source config snapshot — enough to detect source changes. */
    sourceSnapshot: { type: string; path: string }
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
): Promise<void> {
    await set(CACHE_KEY, {
        data,
        cachedAt: new Date().toISOString(),
        sourceSnapshot: { type: config.type, path: config.path },
    } satisfies GameDataCacheEntry)
}

export async function clearGameDataCache(): Promise<void> {
    await del(CACHE_KEY)
}

export function isCacheStale(cachedAt: string): boolean {
    return Date.now() - new Date(cachedAt).getTime() > MAX_AGE_MS
}

export function isCacheForSource(
    entry: GameDataCacheEntry,
    config: DataSourceConfig,
): boolean {
    return (
        entry.sourceSnapshot.type === config.type &&
        entry.sourceSnapshot.path === config.path
    )
}
