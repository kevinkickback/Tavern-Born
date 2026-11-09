import { CheckCircle } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useGameDataStore } from '@/store/gameDataStore'
import { APP_INTERACTIVE_CONTENT_ID } from './AppLayout'

export function AppLoadingOverlay({
  initialRoutePending = false,
  onStartupComplete,
}: {
  initialRoutePending?: boolean
  onStartupComplete?: () => void
}) {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const cacheStatus = useGameDataStore((s) => s.cacheStatus)
  const gameData = useGameDataStore((s) => s.gameData)
  const loadProgress = useGameDataStore((s) => s.loadProgress)
  const error = useGameDataStore((s) => s.error)
  const remoteStartup = useGameDataStore((s) => s.remoteStartup)
  const retryRemote = useGameDataStore((s) => s.loadFromCache)
  const reconfigure = useGameDataStore((s) => s.reconfigureRemoteStartup)

  const shouldStayVisible =
    remoteStartup !== 'setup' &&
    (!hasHydrated ||
      (!gameData &&
        (isLoading || remoteStartup === 'unavailable' || (cacheStatus === 'unknown' && !error))))
  const overlayRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const statusId = useId()

  const isLoadingOverlay =
    (initialRoutePending && remoteStartup !== 'setup') ||
    shouldStayVisible ||
    Boolean(gameData && isLoading)
  const isStartupReady = Boolean(
    onStartupComplete && !isLoadingOverlay && gameData && remoteStartup !== 'setup',
  )
  const isBlocking = isLoadingOverlay || isStartupReady

  useEffect(() => {
    if (!onStartupComplete || isLoadingOverlay) return
    if (!isStartupReady) {
      onStartupComplete()
      return
    }

    // Release startup even if the CSS animation is interrupted or disabled.
    const timeout = window.setTimeout(onStartupComplete, 800)
    return () => window.clearTimeout(timeout)
  }, [isLoadingOverlay, isStartupReady, onStartupComplete])

  useLayoutEffect(() => {
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

  if (!isBlocking) return null

  const hasProgress = !isStartupReady && loadProgress !== null && loadProgress.total > 0
  const isProgressComplete =
    hasProgress &&
    (loadProgress.resource === 'Complete' || loadProgress.resource.endsWith(': Complete'))
  const pct = hasProgress ? Math.round((loadProgress.current / loadProgress.total) * 100) : 0

  let statusLine: string
  if (isStartupReady) {
    statusLine = 'Ready'
  } else if (remoteStartup === 'unavailable') {
    statusLine = 'Game data is unavailable.'
  } else if (remoteStartup === 'loading-srd') {
    statusLine = 'Loading the Included SRD…'
  } else if (!hasHydrated) {
    statusLine = 'Warming up the dice...'
  } else if (gameData && isLoading) {
    statusLine = 'Applying game data…'
  } else if (isLoading) {
    statusLine = isProgressComplete
      ? 'Finalizing game data…'
      : hasProgress
        ? `Loading ${loadProgress.resource}…`
        : 'Connecting to game data source…'
  } else if (shouldStayVisible && cacheStatus === 'unknown') {
    statusLine = 'Checking saved game data…'
  } else if (initialRoutePending) {
    statusLine = 'Opening your workspace…'
  } else {
    statusLine = 'Connecting to game data source…'
  }

  return (
    <div
      ref={overlayRef}
      data-testid="app-loading-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={statusId}
      aria-busy={!isStartupReady && remoteStartup !== 'unavailable'}
      tabIndex={-1}
      onAnimationEnd={(event) => {
        if (isStartupReady && event.target === event.currentTarget) onStartupComplete?.()
      }}
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background',
        isStartupReady && 'startup-ready-exit',
      )}
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
        <div className="flex h-6 items-center justify-center">
          {isStartupReady ? (
            <CheckCircle
              aria-hidden="true"
              data-testid="startup-ready-check"
              className="size-6 text-success motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
            />
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
        </div>
        <div
          id={statusId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex items-center justify-center text-xs text-muted-foreground"
        >
          <span className="min-w-0 text-center leading-4">{statusLine}</span>
          {hasProgress && (
            <span className="ml-3 shrink-0 tabular-nums">
              {loadProgress.current}&thinsp;/&thinsp;{loadProgress.total}
            </span>
          )}
        </div>
      </div>
      {error && !isStartupReady && (
        <p className="mt-8 max-w-xs text-center text-xs text-destructive">{error}</p>
      )}
      {remoteStartup === 'unavailable' && (
        <div className="mt-5 flex max-w-[calc(100vw-2rem)] flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => void retryRemote({ forceCheck: true, retry: true })}
          >
            Retry
          </Button>
          <Button variant="ghost" onClick={reconfigure}>
            Change source
          </Button>
        </div>
      )}
    </div>
  )
}
