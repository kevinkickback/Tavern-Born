import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'

/**
 * Full-screen overlay shown while the app is initialising.
 *
 * Covers the entire viewport (pointer-events included) so users can't
 * interact with the app until game data is ready.
 *
 * Shown during:
 *  - IDB hydration  (!hasHydrated)
 *  - Foreground data fetch  (isLoading && !isBackgroundRefreshing)
 *  - Cache read gap  (gameData not yet available and init still pending)
 *
 * When loading completes, briefly shows a checkmark with "App is ready"
 * before fading out.
 */
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
    (isLoading && !isBackgroundRefreshing) ||
    (!gameData && cacheStatus === 'unknown' && !error)

  // Phase: 'loading' → 'ready' (show checkmark) → 'fading' (fade out) → 'hidden' (unmount)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'fading' | 'hidden'>('loading')

  useEffect(() => {
    if (shouldStayVisible) return

    if (phase === 'loading') {
      setPhase('ready')
      return
    }

    if (phase === 'ready') {
      // Hold the checkmark visible, then start fading.
      const timer = setTimeout(() => setPhase('fading'), 1200)
      return () => clearTimeout(timer)
    }

    if (phase === 'fading') {
      // Wait for the CSS fade-out to finish, then unmount.
      const timer = setTimeout(() => setPhase('hidden'), 500)
      return () => clearTimeout(timer)
    }
  }, [shouldStayVisible, phase])

  if (phase === 'hidden') return null

  const isReady = phase === 'ready' || phase === 'fading'
  const isFading = phase === 'fading'
  const hasProgress = loadProgress !== null
  const pct = hasProgress ? Math.round((loadProgress.current / loadProgress.total) * 100) : 0

  let statusLine: string
  if (isReady) {
    statusLine = 'App is ready'
  } else if (!hasHydrated) {
    statusLine = 'Reading saved settings…'
  } else if (!hasProgress) {
    statusLine = 'Connecting to data source…'
  } else {
    statusLine = `Loading ${loadProgress.resource}…`
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${isFading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="mb-14 text-center select-none">
        <h1 className="font-display text-5xl font-bold tracking-wide text-foreground">
          Tavern Born
        </h1>
        <p className="mt-2 text-xs tracking-widest uppercase text-muted-foreground">
          5e Character Builder
        </p>
      </div>
      <div className="w-72 space-y-2.5">
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
        <div className="flex items-center justify-center text-xs text-muted-foreground">
          <span className="truncate">{statusLine}</span>
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
