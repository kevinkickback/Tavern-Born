import {
  CheckCircle,
  CircleNotch,
  CloudSlash,
  type Icon,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { type CacheStatus, useGameDataStore } from '@/store/gameDataStore'

interface DataStatusPresentation {
  label: string
  detail: string
  icon: Icon
  tone?: string
  spinning?: boolean
}

function getDataStatus(
  cacheStatus: CacheStatus,
  isLoading: boolean,
  isBackgroundRefreshing: boolean,
  error: string | null,
  progress: { current: number; total: number; resource: string } | null,
): DataStatusPresentation {
  if (error) {
    return {
      label: 'Game data issue',
      detail: error,
      icon: WarningCircle,
      tone: 'text-destructive',
    }
  }

  if (isLoading) {
    const count = progress?.total ? ` ${progress.current}/${progress.total}` : ''
    return {
      label: `Loading game data${count}`,
      detail: progress?.resource || 'Loading the configured game data source',
      icon: CircleNotch,
      tone: 'text-primary',
      spinning: true,
    }
  }

  if (isBackgroundRefreshing || cacheStatus === 'stale') {
    return {
      label: 'Refreshing game data',
      detail: 'Cached data remains available while the source is refreshed',
      icon: CircleNotch,
      tone: 'text-primary',
      spinning: true,
    }
  }

  if (cacheStatus === 'offline') {
    return {
      label: 'Using cached game data',
      detail: 'No game data source is currently configured',
      icon: CloudSlash,
      tone: 'text-warning',
    }
  }

  if (cacheStatus === 'unconfigured') {
    return {
      label: 'Game data not configured',
      detail: 'Choose a game data source in Settings',
      icon: WarningCircle,
      tone: 'text-warning',
    }
  }

  if (cacheStatus === 'unknown') {
    return {
      label: 'Preparing game data',
      detail: 'Checking the local game data cache',
      icon: CircleNotch,
      spinning: true,
    }
  }

  return {
    label: 'Game data ready',
    detail:
      cacheStatus === 'fetched'
        ? 'Game data loaded from the configured source'
        : 'Game data loaded from cache',
    icon: CheckCircle,
    tone: 'text-success',
  }
}

export function AppStatusBar() {
  const [appVersion, setAppVersion] = useState('')
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const cacheStatus = useGameDataStore((state) => state.cacheStatus)
  const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig)
  const isLoading = useGameDataStore((state) => state.isLoading)
  const isBackgroundRefreshing = useGameDataStore((state) => state.isBackgroundRefreshing)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const dataStatus = useMemo(
    () => getDataStatus(cacheStatus, isLoading, isBackgroundRefreshing, error, loadProgress),
    [cacheStatus, error, isBackgroundRefreshing, isLoading, loadProgress],
  )
  const DataStatusIcon = dataStatus.icon

  return (
    <div
      role="status"
      aria-label="Application status"
      className="app-no-drag col-[2/4] row-start-3 flex h-6 shrink-0 items-center justify-between bg-app-shell px-3 text-[length:var(--font-size-caption)] leading-[var(--line-height-caption)] text-muted-foreground"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn('flex min-w-0 items-center gap-1.5', dataStatus.tone)}
          title={dataStatus.detail}
          data-testid="game-data-status"
        >
          <DataStatusIcon
            className={cn('size-3.5 shrink-0', dataStatus.spinning && 'animate-spin')}
          />
          <span className="truncate">{dataStatus.label}</span>
        </span>

        {activeCharacter && (
          <>
            <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
            <span
              className={cn(
                'truncate',
                hasUnsavedChanges ? 'font-medium text-warning' : 'text-muted-foreground',
              )}
              data-testid="character-save-status"
            >
              {hasUnsavedChanges ? 'Unsaved changes' : 'Character saved'}
            </span>
          </>
        )}
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-2">
        {dataSourceConfig && (
          <span title={dataSourceConfig.path}>
            {dataSourceConfig.type === 'local' ? 'Local source' : 'Remote source'}
          </span>
        )}
        {dataSourceConfig && appVersion && (
          <span className="h-3 w-px bg-border" aria-hidden="true" />
        )}
        {appVersion && <span className="tabular-nums">v{appVersion}</span>}
      </div>
    </div>
  )
}
