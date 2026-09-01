import { useEffect, useRef } from 'react'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

export function AppTitleBar() {
  const appearance = useAppPreferencesStore((state) => state.themeAppearance)
  const titleBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const titleBar = titleBarRef.current
    if (!titleBar) return

    const shellColor = window.getComputedStyle(titleBar).backgroundColor
    const symbolColor = appearance === 'dark' ? '#fafafa' : '#1c2024'
    window.electronAPI?.setTitleBarOverlay?.(shellColor, symbolColor)
  }, [appearance])

  return (
    <div
      ref={titleBarRef}
      className="app-drag col-[2/4] row-start-1 h-8 shrink-0 bg-app-shell"
      aria-hidden="true"
    />
  )
}
