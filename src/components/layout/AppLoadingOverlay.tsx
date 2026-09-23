import { CheckCircle2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import { APP_INTERACTIVE_CONTENT_ID } from './AppLayout'

export function AppLoadingOverlay() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const isBackgroundRefreshing = useGameDataStore((s) => s.isBackgroundRefreshing)
  const cacheStatus = useGameDataStore((s) => s.cacheStatus)
  const gameData = useGameDataStore((s) => s.gameData)
  const loadProgress = useGameDataStore((s) => s.loadProgress)
  const error = useGameDataStore((s) => s.error)

  const shouldStayVisible =
    !hasHydrated ||
    isLoading ||
    isBackgroundRefreshing ||
    (!gameData && cacheStatus === 'unknown' && !error)

  const [phase, setPhase] = useState<'loading' | 'ready' | 'fading' | 'hidden'>('loading')
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const statusId = useId()

  useEffect(() => {
    // This is a one-shot startup gate. Later user-initiated refreshes remain
    // modeless and report progress through Settings and the app status bar.
    if (phase === 'hidden') return

    if (shouldStayVisible) {
      // A refresh can begin immediately after cached data is restored. Keep the
      // overlay in its loading phase instead of briefly announcing readiness.
      if (phase === 'ready' || phase === 'fading') setPhase('loading')
      return
    }

    if (phase === 'loading') {
      setPhase('ready')
      return
    }

    if (phase === 'ready') {
      const timer = setTimeout(() => setPhase('fading'), 1200)
      return () => clearTimeout(timer)
    }

    if (phase === 'fading') {
      const timer = setTimeout(() => setPhase('hidden'), 500)
      return () => clearTimeout(timer)
    }
  }, [shouldStayVisible, phase])

  const isBlocking = phase !== 'hidden'
  useEffect(() => {
    const appContent = document.getElementById(APP_INTERACTIVE_CONTENT_ID)
    if (!appContent) return

    if (isBlocking) {
      appContent.setAttribute('inert', '')
      appContent.setAttribute('aria-hidden', 'true')
      overlayRef.current?.focus()
    } else {
      appContent.removeAttribute('inert')
      appContent.removeAttribute('aria-hidden')
    }

    return () => {
      appContent.removeAttribute('inert')
      appContent.removeAttribute('aria-hidden')
    }
  }, [isBlocking])

  if (phase === 'hidden') return null

  const isReady = !shouldStayVisible && (phase === 'ready' || phase === 'fading')
  const isFading = !shouldStayVisible && phase === 'fading'
  const hasProgress = loadProgress !== null && loadProgress.total > 0
  const pct = hasProgress ? Math.round((loadProgress.current / loadProgress.total) * 100) : 0

  let statusLine: string
  if (isReady) {
    statusLine = 'App is ready'
  } else if (!hasHydrated) {
    statusLine = 'Loading the app…'
  } else if (isBackgroundRefreshing) {
    statusLine = hasProgress
      ? `Checking ${loadProgress.resource} for updates…`
      : 'Checking for game data updates…'
  } else if (isLoading) {
    statusLine = hasProgress
      ? `Loading ${loadProgress.resource}…`
      : 'Connecting to game data source…'
  } else if (!gameData && cacheStatus === 'unknown') {
    statusLine = 'Checking saved game data…'
  } else {
    statusLine = 'Connecting to game data source…'
  }

  return (
    <div
      ref={overlayRef}
      data-testid="app-loading-overlay"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={statusId}
      aria-busy={!isReady}
      tabIndex={-1}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="mb-14 text-center select-none">
        <h1 id={titleId} className="font-display text-5xl font-bold tracking-wide text-foreground">
          Tavern Born
        </h1>
        <p className="mt-2 text-xs tracking-widest uppercase text-muted-foreground">
          5e Character Builder
        </p>
      </div>
      <div className="w-96 max-w-[calc(100vw-2rem)] space-y-2.5">
        {isReady ? (
          <div className="flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 animate-in zoom-in-50 text-primary" />
          </div>
        ) : (
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            {hasProgress ? (
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            ) : (
              <div className="animate-indeterminate absolute h-full w-2/5 rounded-full bg-primary/70" />
            )}
          </div>
        )}
        <div
          id={statusId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex items-center justify-center text-xs text-muted-foreground"
        >
          <span className="min-w-0 text-center leading-4">{statusLine}</span>
          {!isReady && hasProgress && (
            <span className="ml-3 shrink-0 tabular-nums">
              {loadProgress.current}&thinsp;/&thinsp;{loadProgress.total}
            </span>
          )}
        </div>
      </div>
      {error && <p className="mt-8 max-w-xs text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}
