import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GameData, DataSourceConfig } from '@/types/5etools'
import { loadDataFromSource } from '@/lib/5etools'
import { createIdbStorage } from '@/lib/idb-storage'

interface LoadProgress {
  current: number
  total: number
  resource: string
}

interface GameDataState {
  gameData: GameData | null
  dataSourceConfig: DataSourceConfig | null
  isLoading: boolean
  loadProgress: LoadProgress | null
  error: string | null
  lastLoadedAt: string | null
  
  setGameData: (data: GameData) => void
  setDataSourceConfig: (config: DataSourceConfig) => void
  setLoading: (loading: boolean) => void
  setLoadProgress: (progress: LoadProgress | null) => void
  setError: (error: string | null) => void
  loadGameData: (config: DataSourceConfig) => Promise<void>
  refreshGameData: () => Promise<void>
  clearGameData: () => void
}

export const useGameDataStore = create<GameDataState>()(
  persist(
    (set, get) => ({
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      loadProgress: null,
      error: null,
      lastLoadedAt: null,

      setGameData: (data) => set({ gameData: data }),
      setDataSourceConfig: (config) => set({ dataSourceConfig: config }),
      setLoading: (loading) => set({ isLoading: loading }),
      setLoadProgress: (progress) => set({ loadProgress: progress }),
      setError: (error) => set({ error }),

      loadGameData: async (config) => {
        set({ isLoading: true, error: null, loadProgress: null })
        try {
          const data = await loadDataFromSource(config, {
            onProgress: (current, total, resource) => {
              set({
                loadProgress: { current, total, resource },
              })
            },
          })

          set({
            gameData: data,
            dataSourceConfig: { ...config, isValid: true, lastLoaded: new Date().toISOString() },
            isLoading: false,
            loadProgress: null,
            lastLoadedAt: new Date().toISOString(),
          })
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load game data',
            isLoading: false,
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
        set({
          gameData: null,
          dataSourceConfig: null,
          isLoading: false,
          loadProgress: null,
          error: null,
          lastLoadedAt: null,
        })
      },
    }),
    {
      name: 'game-data-storage',
      storage: createIdbStorage(),
      partialize: (state) => ({
        dataSourceConfig: state.dataSourceConfig,
        lastLoadedAt: state.lastLoadedAt,
        gameData: null,
      }),
    }
  )
)
