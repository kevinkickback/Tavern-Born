import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function useDataInit() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const loadFromCache = useGameDataStore((s) => s.loadFromCache)
  const autoRefreshGameData = useAppPreferencesStore((s) => s.autoRefreshGameData)

  const initialized = useRef(false)

  useEffect(() => {
    // When a local data source config is restored from persisted storage,
    // notify the main process so it can enforce path-containment on file reads.
    if (
      hasHydrated &&
      dataSourceConfig?.type === 'local' &&
      dataSourceConfig.path &&
      window.electronAPI?.setLocalDataPath
    ) {
      window.electronAPI.setLocalDataPath(dataSourceConfig.path)
    }
  }, [hasHydrated, dataSourceConfig])

  useEffect(() => {
    // Wait for Zustand to finish reading from IDB.
    if (!hasHydrated) return
    // Only run once; data may already be present if user configured mid-session.
    if (initialized.current || gameData || isLoading) return
    initialized.current = true

    async function init() {
      const result = await loadFromCache({ forceCheck: autoRefreshGameData })
      if (result.needsToast === 'offline') {
        toast.warning(
          'No data source is configured. Using cached data — some content may be outdated.',
          { duration: 8000 },
        )
      }
    }

    init()
  }, [hasHydrated, gameData, isLoading, loadFromCache, autoRefreshGameData])
}
