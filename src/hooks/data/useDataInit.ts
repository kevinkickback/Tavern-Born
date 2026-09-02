import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function useDataInit() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const loadFromCache = useGameDataStore((s) => s.loadFromCache)
  const autoRefreshGameData = useAppPreferencesStore((s) => s.autoRefreshGameData)

  const initialized = useRef(false)

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
      if (autoRefreshGameData && (await result.backgroundRefresh)) {
        toast.success('Game data updated', {
          description: 'Updated game data files were loaded automatically.',
        })
      }
    }

    init()
  }, [hasHydrated, gameData, isLoading, loadFromCache, autoRefreshGameData])
}
