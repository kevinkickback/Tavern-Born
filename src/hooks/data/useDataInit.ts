import { useEffect, useRef } from 'react'
import { useAppPreferencesHydrated, useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function useDataInit() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const loadFromCache = useGameDataStore((s) => s.loadFromCache)
  const checkCatalogIfDue = useGameDataStore((s) => s.checkCatalogIfDue)
  const autoRefreshGameData = useAppPreferencesStore((s) => s.autoRefreshGameData)

  const preferencesReady = useAppPreferencesHydrated()
  const initialized = useRef(false)

  useEffect(() => {
    // Wait for Zustand to finish reading from IDB.
    if (!hasHydrated || !preferencesReady) return
    // Only run once; data may already be present if user configured mid-session.
    if (initialized.current || gameData || isLoading) return
    initialized.current = true

    void loadFromCache({ checkForUpdates: autoRefreshGameData })
  }, [hasHydrated, preferencesReady, gameData, isLoading, loadFromCache, autoRefreshGameData])

  useEffect(() => {
    if (!hasHydrated || !preferencesReady || !autoRefreshGameData) return

    const checkOnFocus = () => void checkCatalogIfDue()
    window.addEventListener('focus', checkOnFocus)
    return () => window.removeEventListener('focus', checkOnFocus)
  }, [hasHydrated, preferencesReady, autoRefreshGameData, checkCatalogIfDue])
}
