import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GameData, DataSourceConfig } from '@/types/5etools'
import { loadDataFromSource } from '@/lib/5etools'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import { writeGameDataCache, clearGameDataCache } from '@/lib/storage/dataCache'

interface LoadProgress {
  current: number
  total: number
  resource: string
}

/** How the current gameData was sourced this session. */
export type CacheStatus =
    | 'unknown'       // initial, before hydration
    | 'fresh'         // loaded from cache, within 24 h, same source
    | 'stale'         // loaded from cache, being refreshed in background
    | 'offline'       // loaded from cache, no source configured
    | 'fetched'       // freshly fetched from source this session
    | 'unconfigured'  // no cache and no source — user must configure

interface GameDataState {
  gameData: GameData | null
  dataSourceConfig: DataSourceConfig | null
  isLoading: boolean
  isBackgroundRefreshing: boolean
  loadProgress: LoadProgress | null
  error: string | null
  lastLoadedAt: string | null
  cacheStatus: CacheStatus
  /** True once the Zustand persist middleware has read back from IDB. */
  hasHydrated: boolean

  setGameData: (data: GameData) => void
  setCacheStatus: (status: CacheStatus) => void
  setDataSourceConfig: (config: DataSourceConfig) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: LoadProgress | null) => void
  setError: (error: string | null) => void
  setHasHydrated: (v: boolean) => void

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
      cacheStatus: 'unknown',
      hasHydrated: false,

      setGameData: (data) => set({ gameData: data }),
      setCacheStatus: (status) => set({ cacheStatus: status }),
      setDataSourceConfig: (config) => set({ dataSourceConfig: config }),
      setLoading: (loading) => set({ isLoading: loading }),
      setLoadProgress: (progress) => set({ loadProgress: progress }),
      setError: (error) => set({ error }),
      setHasHydrated: (v) => set({ hasHydrated: v }),

      loadGameData: async (config, background = false) => {
        if (background) {
          set({ isBackgroundRefreshing: true, error: null })
        } else {
          set({ isLoading: true, error: null, loadProgress: null })
        }
        try {
          const data = await loadDataFromSource(config, {
            onProgress: background
              ? undefined
              : (current, total, resource) => set({ loadProgress: { current, total, resource } }),
          })
          const now = new Date().toISOString()
          // Persist parsed data to IDB cache so next launch is instant.
          await writeGameDataCache(data, config)
          set({
            gameData: data,
            dataSourceConfig: { ...config, isValid: true, lastLoaded: now },
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
            lastLoadedAt: now,
            cacheStatus: 'fetched',
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load game data',
            isLoading: false,
            isBackgroundRefreshing: false,
            loadProgress: null,
          })
        }
      },

      refreshGameData: async () => {
        const { dataSourceConfig } = get()
        if (dataSourceConfig) {
          await get().loadGameData(dataSourceConfig)
        }
      },

      clearGameData: () => {
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
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
