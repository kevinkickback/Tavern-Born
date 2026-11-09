import { CheckCircle, CircleNotch, type Icon, WarningCircle } from '@phosphor-icons/react'
import CircleArrowUp from 'lucide-react/dist/esm/icons/circle-arrow-up'
import CloudOff from 'lucide-react/dist/esm/icons/cloud-off'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { type CacheStatus, useGameDataStore } from '@/store/gameDataStore'

interface DataStatusPresentation {
  label: string
  detail?: string
  icon: Icon | typeof CloudOff
  tone?: string
  spinning?: boolean
}

function getDataStatus(
  cacheStatus: CacheStatus,
  isLoading: boolean,
  isBackgroundRefreshing: boolean,
  error: string | null,
  progress: { current: number; total: number; resource: string } | null,
  catalogLabel: string | null,
  catalogDetail?: string,
): DataStatusPresentation {
  if (isLoading || isBackgroundRefreshing) {
    const count = progress?.total ? ` ${progress.current}/${progress.total}` : ''
    return {
      label: isLoading ? `Loading game data${count}` : 'Checking for game data updates',
      detail: isLoading ? progress?.resource : undefined,
      icon: CircleNotch,
      tone: 'text-primary',
      spinning: true,
    }
  }

  if (cacheStatus === 'session-srd' || cacheStatus === 'remote-cache') {
    return {
      label: catalogLabel ?? 'Using saved game data',
      detail:
        error ??
        (cacheStatus === 'session-srd'
          ? 'Using Included SRD this session. Check the configured source in Settings.'
          : 'Using saved game data. See Settings for details.'),
      icon: CloudOff,
      tone: 'text-warning-foreground',
    }
  }

  if (error || cacheStatus === 'unconfigured') {
    return {
      label: error ? (catalogLabel ?? 'Game data issue') : 'Game data not configured',
      detail: error ?? 'Choose a source in Settings.',
      icon: WarningCircle,
      tone: error ? 'text-destructive' : 'text-warning-foreground',
    }
  }

  if (cacheStatus === 'unknown') {
    return {
      label: 'Preparing game data',
      detail: 'Checking saved game data.',
      icon: CircleNotch,
      spinning: true,
    }
  }

  return {
    label: catalogLabel ?? 'Game data ready',
    detail: catalogDetail,
    icon: CheckCircle,
  }
}

const updateActionClass =
  'inline-flex shrink-0 cursor-pointer items-center gap-1 text-warning-foreground hover:underline'

export function AppStatusBar({ onOpenAppUpdate }: { onOpenAppUpdate?: () => void }) {
  const [appVersion, setAppVersion] = useState('')
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const cacheStatus = useGameDataStore((state) => state.cacheStatus)
  const hasDataUpdate = useGameDataStore((state) => !!(state.gameData && state.pendingCatalog))
  const dataSourceConfig = useGameDataStore((state) =>
    state.gameData ? (state.sessionBundledSource ?? state.dataSourceConfig) : null,
  )
  const isLoading = useGameDataStore((state) => state.isLoading)
  const isBackgroundRefreshing = useGameDataStore((state) => state.isBackgroundRefreshing)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)
  const isBundledCatalog = dataSourceConfig?.type === 'bundled'
  const catalogLabel = dataSourceConfig
    ? isBundledCatalog
      ? 'SRD Content Only'
      : 'Additional Content Loaded'
    : null
  const catalogDetail = isBundledCatalog
    ? `${dataSourceConfig.packId} ${dataSourceConfig.packVersion}`
    : dataSourceConfig?.path

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setAppVersion)
      .catch(() => {})
  }, [])

  const dataStatus = getDataStatus(
    cacheStatus,
    isLoading,
    isBackgroundRefreshing,
    error,
    loadProgress,
    catalogLabel,
    catalogDetail,
  )
  const DataStatusIcon = dataStatus.icon
  const updateAvailable = (
    <>
      <CircleArrowUp className="size-3.5" aria-hidden="true" />
      Update available
    </>
  )
  const separator = <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />

  return (
    <div
      role="status"
      aria-label="Application status"
      className="app-no-drag col-start-3 row-start-3 flex min-w-0 items-center gap-3 bg-app-shell px-3 text-[length:var(--font-size-caption)] leading-[var(--line-height-caption)] text-muted-foreground"
    >
      {activeCharacter && (
        <span
          className={cn(
            'min-w-0 truncate',
            hasUnsavedChanges && 'font-medium text-warning-foreground',
          )}
          data-testid="character-save-status"
        >
          {hasUnsavedChanges ? 'Unsaved changes' : 'Character saved'}
        </span>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn('flex min-w-0 items-center gap-1.5', dataStatus.tone)}
            title={dataStatus.detail}
            data-testid="game-data-status"
          >
            <DataStatusIcon
              aria-hidden="true"
              className={cn('size-3.5 shrink-0', dataStatus.spinning && 'animate-spin')}
            />
            <span
              className={cn(
                'truncate',
                isBundledCatalog && dataStatus.label === catalogLabel && 'text-muted-foreground',
              )}
            >
              {dataStatus.label}
            </span>
          </span>
          {hasDataUpdate && (
            <>
              {separator}
              <Link
                to="/settings?section=data#game-data-update"
                aria-label="Game data update available"
                className={updateActionClass}
              >
                {updateAvailable}
              </Link>
            </>
          )}
        </div>
        {(appVersion || onOpenAppUpdate) && (
          <>
            <span className="shrink-0" aria-hidden="true">
              •
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {appVersion && <span className="tabular-nums">v{appVersion}</span>}
              {onOpenAppUpdate && (
                <>
                  {appVersion && separator}
                  <button
                    type="button"
                    aria-label="App update available"
                    className={updateActionClass}
                    onClick={onOpenAppUpdate}
                  >
                    {updateAvailable}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
