import { useEffect } from 'react'
import { getTitleBarOverlayHeight } from '@/lib/overlayPosition'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

export function AppTitleBar() {
  const appearance = useAppPreferencesStore((state) => state.themeAppearance)
  const uiScale = useAppPreferencesStore((state) => state.uiScale)

  useEffect(() => {
    // Electron's native title-bar overlay accepts hex colors. Computed Radix colors may
    // serialize as display-p3, which the main-process validation intentionally rejects.
    const shellColor = appearance === 'dark' ? '#111113' : '#cdced6'
    const symbolColor = appearance === 'dark' ? '#fafafa' : '#1c2024'
    const height = getTitleBarOverlayHeight(uiScale)
    window.electronAPI?.setTitleBarOverlay?.(shellColor, symbolColor, height)
  }, [appearance, uiScale])

  return (
    <div className="app-drag col-[2/4] row-start-1 h-8 shrink-0 bg-app-shell" aria-hidden="true" />
  )
}
