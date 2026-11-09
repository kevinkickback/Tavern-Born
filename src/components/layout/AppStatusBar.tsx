import {
  CheckCircle,
  CircleNotch,
  CloudSlash,
  type Icon,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
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
  catalogLabel: string | null,
  catalogDetail?: string,
): DataStatusPresentation {
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

  if (isBackgroundRefreshing) {
    return {
      label: 'Checking for game data updates',
      detail: 'The current catalog is available while the app checks for updates.',
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
          : 'Using saved game data. See Settings for details about the failed check.'),
      icon: CloudSlash,
      tone: 'text-warning-foreground',
    }
  }

  if (error) {
    return {
      label: catalogLabel ?? 'Game data issue',
      detail: error,
      icon: WarningCircle,
      tone: 'text-destructive',
    }
  }

  if (cacheStatus === 'unconfigured') {
    return {
      label: 'Game data not configured',
      detail: 'Use the Included SRD or add compatible 5etools data in Settings',
      icon: WarningCircle,
      tone: 'text-warning-foreground',
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
    label: catalogLabel ?? 'Game data ready',
    detail: catalogDetail ?? 'Game data is ready to use.',
    icon: CheckCircle,
    tone: 'text-success',
  }
}

export function AppStatusBar() {
  const [appVersion, setAppVersion] = useState('')
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const cacheStatus = useGameDataStore((state) => state.cacheStatus)
  const hasCatalog = useGameDataStore((state) => state.gameData !== null)
  const dataSourceConfig = useGameDataStore(
    (state) => state.sessionBundledSource ?? state.dataSourceConfig,
  )
  const isLoading = useGameDataStore((state) => state.isLoading)
  const isBackgroundRefreshing = useGameDataStore((state) => state.isBackgroundRefreshing)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)
  const catalogLabel =
    !hasCatalog || !dataSourceConfig
      ? null
      : dataSourceConfig.type === 'bundled'
        ? 'Included SRD'
        : 'Additional Content'
  const catalogDetail =
    dataSourceConfig?.type === 'bundled'
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

  return (
    <div
      role="status"
      aria-label="Application status"
      className="app-no-drag col-[2/4] row-start-3 flex h-6 shrink-0 items-center justify-between bg-app-shell px-3 text-[length:var(--font-size-caption)] leading-[var(--line-height-caption)] text-muted-foreground"
    >
      <div className="min-w-0 truncate">
        {activeCharacter && (
          <span
            className={cn(
              hasUnsavedChanges ? 'font-medium text-warning-foreground' : 'text-muted-foreground',
            )}
            data-testid="character-save-status"
          >
            {hasUnsavedChanges ? 'Unsaved changes' : 'Character saved'}
          </span>
        )}
      </div>

      <div className="ml-3 flex min-w-0 items-center gap-2">
        <span
          className={cn('flex min-w-0 items-center gap-1.5', dataStatus.tone)}
          title={dataStatus.detail}
          data-testid="game-data-status"
        >
          <DataStatusIcon
            aria-hidden="true"
            className={cn('size-3.5 shrink-0', dataStatus.spinning && 'animate-spin')}
          />
          <span className="truncate">{dataStatus.label}</span>
        </span>
        {appVersion && <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />}
        {appVersion && <span className="shrink-0 tabular-nums">v{appVersion}</span>}
      </div>
    </div>
  )
}
