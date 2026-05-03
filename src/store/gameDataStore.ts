import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { loadDataFromSource } from '@/lib/5etools'
import {
  clearGameDataCache,
  isCacheForSource,
  isCacheStale,
  readGameDataCache,
  writeGameDataCache,
} from '@/lib/storage/dataCache'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import type { DataSourceConfig, GameData } from '@/types/5etools'

let activeLoadController: AbortController | null = null
let activeLoadRequestId = 0

interface LoadProgress {
  current: number
  total: number
  resource: string
}

/** How the current gameData was sourced this session. */
export type CacheStatus =
  | 'unknown' // initial, before hydration
  | 'fresh' // loaded from cache, within 24 h, same source
  | 'stale' // loaded from cache, being refreshed in background
  | 'offline' // loaded from cache, no source configured
  | 'fetched' // freshly fetched from source this session
  | 'unconfigured' // no cache and no source — user must configure

interface GameDataState {
  gameData: GameData | null
  dataSourceConfig: DataSourceConfig | null
  isLoading: boolean
  isBackgroundRefreshing: boolean
  loadProgress: LoadProgress | null
  error: string | null
  lastLoadedAt: string | null
  lastDataChangedAt: string | null
  lastUpdateCheckAt: string | null
  cacheStatus: CacheStatus
  /** True once the Zustand persist middleware has read back from IDB. */
  hasHydrated: boolean

  setGameData: (data: GameData) => void
  setCacheStatus: (status: CacheStatus) => void
  setDataSourceConfig: (config: DataSourceConfig) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: LoadProgress | null) => void
  setError: (error: string | null) => void
  setLastDataChangedAt: (iso: string | null) => void
  setHasHydrated: (v: boolean) => void

  /**
   * Read from IDB cache and populate store state. Returns a hint for which
   * toast (if any) the caller should display — the store does not import UI libs.
   */
  loadFromCache: () => Promise<{ needsToast?: 'stale' | 'offline' }>

  /**
   * Fetch data from `config`, write to IDB cache, update store.
   * Pass `background = true` to do a silent refresh without blocking UI.
   */
  loadGameData: (config: DataSourceConfig, background?: boolean) => Promise<void>
  refreshGameData: () => Promise<void>
  clearGameData: () => void
}

export const useGameDataStore = create<GameDataState>()(
  persist(
    (set, get) => ({
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
      lastLoadedAt: null,
      lastDataChangedAt: null,
      lastUpdateCheckAt: null,
      cacheStatus: 'unknown',
      hasHydrated: false,

      setGameData: (data) => set({ gameData: data }),
      setCacheStatus: (status) => set({ cacheStatus: status }),
      setDataSourceConfig: (config) => set({ dataSourceConfig: config }),
      setLoading: (loading) => set({ isLoading: loading }),
      setLoadProgress: (progress) => set({ loadProgress: progress }),
      setError: (error) => set({ error }),
      setLastDataChangedAt: (iso) => set({ lastDataChangedAt: iso }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      loadFromCache: async () => {
        const {
          dataSourceConfig,
          lastUpdateCheckAt,
          loadGameData,
          setGameData,
          setCacheStatus,
          setLastDataChangedAt,
        } = get()
        const cache = await readGameDataCache()

        if (!cache && !dataSourceConfig) {
          setCacheStatus('unconfigured')
          return {}
        }

        if (cache && dataSourceConfig) {
          if (!isCacheForSource(cache, dataSourceConfig)) {
            await loadGameData(dataSourceConfig)
            return {}
          }
          if (isCacheStale(cache.cachedAt)) {
            setGameData(cache.data)
            setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
            setCacheStatus('stale')
            loadGameData(dataSourceConfig, true)
            return { needsToast: 'stale' }
          }
          setGameData(cache.data)
          setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
          setCacheStatus('fresh')
          // Only verify source in background if we haven't checked recently (within 1 hour).
          const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
          const lastCheckedMs = lastUpdateCheckAt
            ? new Date(lastUpdateCheckAt).getTime()
            : Number.NaN
          const checkedRecently =
            Number.isFinite(lastCheckedMs) && Date.now() - lastCheckedMs < UPDATE_CHECK_INTERVAL_MS
          if (!checkedRecently) {
            loadGameData(dataSourceConfig, true)
          }
          return {}
        }

        if (cache && !dataSourceConfig) {
          setGameData(cache.data)
          setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
          setCacheStatus('offline')
          return { needsToast: 'offline' }
        }

        if (!cache && dataSourceConfig) {
          await loadGameData(dataSourceConfig)
          return {}
        }

        return {}
      },

      loadGameData: async (config, background = false) => {
        const requestId = ++activeLoadRequestId
        activeLoadController?.abort()
        const controller = new AbortController()
        activeLoadController = controller

        if (background) {
          set({
            isBackgroundRefreshing: true,
            error: null,
          })
        } else {
          set({
            isLoading: true,
            error: null,
            loadProgress: null,
          })
        }

        try {
          const data = await loadDataFromSource(config, {
            onProgress: background
              ? undefined
              : (current, total, resource) => set({ loadProgress: { current, total, resource } }),
            signal: controller.signal,
          })

          // Ignore stale results from superseded requests.
          if (requestId !== activeLoadRequestId) {
            return
          }

          const now = new Date().toISOString()
          // Persist parsed data to IDB cache so next launch is instant.
          const prevChangedAt = get().lastDataChangedAt
          const hadGameData = get().gameData !== null
          const cacheEntry = await writeGameDataCache(data, config)
          const contentChanged = cacheEntry.lastDataChangedAt !== prevChangedAt
          const shouldHydrateMemory = contentChanged || !hadGameData
          set({
            gameData: shouldHydrateMemory ? data : get().gameData,
            dataSourceConfig: { ...config, isValid: true, lastLoaded: now },
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
            lastLoadedAt: now,
            ...(contentChanged || !prevChangedAt
              ? { lastDataChangedAt: cacheEntry.lastDataChangedAt ?? now }
              : {}),
            lastUpdateCheckAt: now,
            cacheStatus: 'fetched',
          })
        } catch (error) {
          // Ignore stale request failures and intentional aborts.
          if (requestId !== activeLoadRequestId) {
            return
          }

          const isAbortError =
            (error instanceof DOMException && error.name === 'AbortError') ||
            (error instanceof Error && error.name === 'AbortError')
          if (isAbortError) {
            set({
              isLoading: false,
              isBackgroundRefreshing: false,
              loadProgress: null,
            })
            return
          }

          set({
            error: error instanceof Error ? error.message : 'Failed to load game data',
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
          })
        } finally {
          if (activeLoadController === controller) {
            activeLoadController = null
          }
        }
      },

      refreshGameData: async () => {
        const { dataSourceConfig } = get()
        if (dataSourceConfig) {
          await get().loadGameData(dataSourceConfig)
        }
      },

      clearGameData: () => {
        activeLoadController?.abort()
        activeLoadController = null
        // Fire-and-forget IDB cache clear.
        clearGameDataCache().catch(console.error)
        set({
          gameData: null,
          dataSourceConfig: null,
          isLoading: false,
          isBackgroundRefreshing: false,
          loadProgress: null,
          error: null,
          lastLoadedAt: null,
          lastDataChangedAt: null,
          lastUpdateCheckAt: null,
          cacheStatus: 'unconfigured',
        })
      },
    }),
    {
      name: 'game-data-storage',
      storage: createIdbStorage(),
      // Only persist the config — game data is cached separately in dataCache.ts.
      partialize: (state) => ({
        dataSourceConfig: state.dataSourceConfig,
        lastLoadedAt: state.lastLoadedAt,
        lastDataChangedAt: state.lastDataChangedAt,
        lastUpdateCheckAt: state.lastUpdateCheckAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
