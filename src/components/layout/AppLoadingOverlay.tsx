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
 *
 * Hidden once hydration completes and no foreground fetch is running —
 * the DataSourceStartupModal then handles the "no data configured" state.
 */
export function AppLoadingOverlay() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const isBackgroundRefreshing = useGameDataStore((s) => s.isBackgroundRefreshing)
  const loadProgress = useGameDataStore((s) => s.loadProgress)
  const error = useGameDataStore((s) => s.error)

  const show = !hasHydrated || (isLoading && !isBackgroundRefreshing)

  if (!show) return null

  const hasProgress = loadProgress !== null
  const pct = hasProgress ? Math.round((loadProgress.current / loadProgress.total) * 100) : 0

  let statusLine: string
  if (!hasHydrated) {
    statusLine = 'Reading saved settings…'
  } else if (!hasProgress) {
    statusLine = 'Connecting to data source…'
  } else {
    statusLine = `Loading ${loadProgress.resource}…`
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      <div className="mb-14 text-center select-none">
        <h1 className="font-display text-5xl font-bold tracking-wide text-foreground">
          Tavern Born
        </h1>
        <p className="mt-2 text-xs tracking-widest uppercase text-muted-foreground">
          5e Character Builder
        </p>
      </div>
      <div className="w-72 space-y-2.5">
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
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{statusLine}</span>
          {hasProgress && (
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
