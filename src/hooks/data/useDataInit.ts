import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { isCacheForSource, isCacheStale, readGameDataCache } from '@/lib/storage/dataCache'

import { useGameDataStore } from '@/store/gameDataStore'

export function useDataInit() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const loadGameData = useGameDataStore((s) => s.loadGameData)
  const setGameData = useGameDataStore((s) => s.setGameData)
  const setCacheStatus = useGameDataStore((s) => s.setCacheStatus)
  const setLastDataChangedAt = useGameDataStore((s) => s.setLastDataChangedAt)

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
      const cache = await readGameDataCache()
      const config = dataSourceConfig

      const hasCache = cache !== null
      const hasSource = config !== null

      if (!hasCache && !hasSource) {
        setCacheStatus('unconfigured')
        return
      }

      if (hasCache && hasSource) {
        const sameSource = isCacheForSource(cache, config)
        const stale = isCacheStale(cache.cachedAt)

        if (!sameSource) {
          // Source changed — cache is for a different dataset; fetch fresh.
          await loadGameData(config)
          return
        }

        if (stale) {
          // Same source but >24 h old — serve cache immediately for a fast
          // start, then refresh in background.
          setGameData(cache.data)
          setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
          setCacheStatus('stale')

          toast.info('Game data is out of date — refreshing in the background…', {
            duration: 5000,
          })
          loadGameData(config, true) // background=true, don't await
          return
        }

        setGameData(cache.data)
        setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
        setCacheStatus('fresh')
        // Even with a fresh cache, verify the source on launch in background.
        loadGameData(config, true) // background=true, don't await
        return
      }

      if (hasCache && !hasSource) {
        setGameData(cache.data)
        setLastDataChangedAt(cache.lastDataChangedAt ?? cache.cachedAt)
        setCacheStatus('offline')
        toast.warning(
          'No data source is configured. Using cached data — some content may be outdated.',
          { duration: 8000 },
        )
        return
      }

      if (!hasCache && hasSource) {
        await loadGameData(config)
      }
    }

    init()
  }, [
    hasHydrated,
    gameData,
    isLoading,
    dataSourceConfig,
    loadGameData,
    setGameData,
    setCacheStatus,
    setLastDataChangedAt,
  ])
}
