import { useEffect } from 'react'
import { useAppPreferencesHydrated, useAppPreferencesStore } from '@/store/appPreferencesStore'

export function useAppUpdatePreference() {
  const preferencesReady = useAppPreferencesHydrated()
  const autoUpdate = useAppPreferencesStore((state) => state.autoUpdate)

  useEffect(() => {
    if (!preferencesReady) return
    void window.electronAPI?.setAutoCheck?.(autoUpdate).catch((error) => {
      console.error('Could not configure automatic update checks:', error)
    })
  }, [autoUpdate, preferencesReady])
}
