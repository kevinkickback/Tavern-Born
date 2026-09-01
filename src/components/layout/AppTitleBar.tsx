import { useEffect, useRef } from 'react'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

export function AppTitleBar() {
  const appearance = useAppPreferencesStore((state) => state.themeAppearance)
  const titleBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const titleBar = titleBarRef.current
    if (!titleBar) return

    // Electron's native title-bar overlay accepts hex colors. Computed Radix colors may
    // serialize as display-p3, which the main-process validation intentionally rejects.
    const shellColor = appearance === 'dark' ? '#111113' : '#f9f9fb'
    const symbolColor = appearance === 'dark' ? '#fafafa' : '#1c2024'
    const height = Math.round(titleBar.getBoundingClientRect().height)
    window.electronAPI?.setTitleBarOverlay?.(shellColor, symbolColor, height)
  }, [appearance])

  return (
    <div
      ref={titleBarRef}
      className="app-drag col-[2/4] row-start-1 h-8 shrink-0 bg-app-shell"
      aria-hidden="true"
    />
  )
}
