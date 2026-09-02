import {
  ArrowClockwise,
  ArrowsLeftRight,
  CheckCircle,
  CloudArrowDown,
  Database,
  FolderOpen,
  Trash,
  Warning,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Section } from '@/components/workspace'
import { validateDataSource } from '@/lib/5etools'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type DataSourceConfiguratorProps = {
  selectorOnly?: boolean
}

export function isValidatableRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false

    const hostname = url.hostname.replace(/\.$/, '')
    const labels = hostname.split('.')
    return labels.length >= 2 && labels.every((label) => label.length > 0)
  } catch {
    return false
  }
}

export function DataSourceConfigurator({ selectorOnly = false }: DataSourceConfiguratorProps) {
  const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig)
  const gameData = useGameDataStore((state) => state.gameData)
  const isLoading = useGameDataStore((state) => state.isLoading)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)
  const lastDataChangedAt = useGameDataStore((state) => state.lastDataChangedAt)
  const lastUpdateCheckAt = useGameDataStore((state) => state.lastUpdateCheckAt)
  const cacheStatus = useGameDataStore((state) => state.cacheStatus)
  const loadGameData = useGameDataStore((state) => state.loadGameData)
  const clearGameData = useGameDataStore((state) => state.clearGameData)
  const hasActiveDataSource = dataSourceConfig?.isValid && gameData !== null
  const autoRefreshGameData = useAppPreferencesStore((state) => state.autoRefreshGameData)
  const setAutoRefreshGameData = useAppPreferencesStore((state) => state.setAutoRefreshGameData)

  const [sourceType, setSourceType] = useState<'local' | 'remote'>(
    dataSourceConfig?.type || 'remote',
  )
  const [sourcePath, setSourcePath] = useState('')
  const [isSelectingDataSource, setIsSelectingDataSource] = useState(!hasActiveDataSource)
  const [isValidating, setIsValidating] = useState(false)
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const remotePathId = useId()
  const localPathId = useId()
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean
    error?: string
    foundResources?: string[]
    normalizedPath?: string
  } | null>(null)
  const autoOpenedSelectorRef = useRef(!hasActiveDataSource)

  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestRef = useRef(0)

  const handleSourceTypeChange = (newType: 'local' | 'remote') => {
    setSourceType(newType)
    setSourcePath('')
    setValidationStatus('idle')
    setIsValidating(false)
    setValidationResult(null)
    validationRequestRef.current += 1
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }
  }

  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasActiveDataSource) {
      autoOpenedSelectorRef.current = true
      setIsSelectingDataSource(true)
      return
    }

    if (autoOpenedSelectorRef.current && !selectorOnly) {
      setIsSelectingDataSource(false)
      autoOpenedSelectorRef.current = false
    }
  }, [hasActiveDataSource, selectorOnly])

  const performValidation = async (path: string, type: 'local' | 'remote') => {
    const requestId = ++validationRequestRef.current

    if (!path) {
      setValidationStatus('idle')
      setIsValidating(false)
      setValidationResult(null)
      return
    }

    setValidationStatus('validating')
    setIsValidating(true)

    try {
      const result = await validateDataSource({
        type,
        path,
        isValid: false,
      })

      if (requestId !== validationRequestRef.current) return

      setValidationResult(result)
      setValidationStatus(result.isValid ? 'valid' : 'invalid')

      if (!result.isValid) {
        toast.error('Data source validation failed', {
          description: result.error,
        })
      }
    } catch (error) {
      if (requestId !== validationRequestRef.current) return

      setValidationResult({
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      setValidationStatus('invalid')
      toast.error('Validation failed')
    } finally {
      if (requestId === validationRequestRef.current) {
        setIsValidating(false)
      }
    }
  }

  const handleUrlChange = (value: string) => {
    validationRequestRef.current += 1
    setSourcePath(value)
    setValidationStatus('idle')
    setIsValidating(false)
    setValidationResult(null)

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    if (value && sourceType === 'remote') {
      if (isValidatableRemoteUrl(value)) {
        setValidationStatus('validating')
        setIsValidating(true)
        validationTimeoutRef.current = setTimeout(() => {
          performValidation(value, 'remote')
        }, 400)
      } else {
        setValidationStatus('idle')
        setIsValidating(false)
      }
    }
  }

  const handleSelectFolder = async () => {
    try {
      const selectFolder = window.electronAPI?.selectFolder
      if (!selectFolder) {
        toast.error('Folder picker is only available in the desktop app')
        return
      }

      const folderPath = await selectFolder()
      if (!folderPath) return

      setSourcePath(folderPath)
      performValidation(folderPath, 'local')
    } catch (error) {
      toast.error('Failed to select folder', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleSaveConfig = async () => {
    try {
      const pathToUse = validationResult?.normalizedPath || sourcePath

      await loadGameData({
        type: sourceType,
        path: pathToUse,
        isValid: true,
      })

      const { gameData: loadedGameData, error: loadError } = useGameDataStore.getState()
      if (loadError || !loadedGameData) {
        throw new Error(loadError || 'Game data failed to load')
      }

      toast.success('Data source updated and loaded!', {
        description: 'Game data is now available',
      })
      setIsSelectingDataSource(false)
      setSourcePath('')
      setValidationStatus('idle')
      setValidationResult(null)
    } catch (error) {
      toast.error('Failed to load game data', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleRefresh = async () => {
    if (!dataSourceConfig) return
    const previousChangedAt = lastDataChangedAt
    try {
      const contentChanged = await loadGameData(dataSourceConfig, true)
      const { error: loadError } = useGameDataStore.getState()
      if (loadError) {
        toast.error('Failed to check for updates', { description: loadError })
        return
      }

      const newChangedAt = useGameDataStore.getState().lastDataChangedAt
      if (contentChanged || newChangedAt !== previousChangedAt) {
        toast.success('Game data updated successfully!')
      } else {
        toast.info('Data is already up to date')
      }
    } catch (_error) {
      toast.error('Failed to check for updates')
    }
  }

  const handleClear = async () => {
    autoOpenedSelectorRef.current = true
    setIsSelectingDataSource(true)
    setSourcePath('')
    setValidationStatus('idle')
    setValidationResult(null)
    try {
      await clearGameData()
      toast.info('Game data cleared')
    } catch (clearError) {
      toast.error('Failed to clear cached game data', {
        description: clearError instanceof Error ? clearError.message : 'Unknown error',
      })
    }
  }

  const getProgressPercent = () => {
    if (!loadProgress) return 0
    return Math.round((loadProgress.current / loadProgress.total) * 100)
  }

  const isValidSource = validationStatus === 'valid'

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Not yet'
    return new Date(iso).toLocaleString()
  }

  const getStatusLabel = () => {
    if (error) return 'Error'
    if (cacheStatus === 'fresh' || cacheStatus === 'fetched') {
      return 'Up to date'
    }
    return 'Outdated'
  }

  const getValidationBorderClass = () => {
    if (validationStatus === 'validating') return 'border-muted-foreground/50'
    if (validationStatus === 'valid') return 'border-success'
    if (validationStatus === 'invalid') return 'border-destructive'
    return ''
  }

  return (
    <div className="min-w-0">
      <Section
        title={selectorOnly ? 'Choose a data source' : 'Data Source Configuration'}
        description={
          selectorOnly
            ? 'Use a remote repository or a local 5etools data directory.'
            : 'Configure where to load game data from.'
        }
        className="pt-0"
      >
        <div className="space-y-4">
          {!selectorOnly && hasActiveDataSource && !isSelectingDataSource ? (
            <div className="relative space-y-3 rounded-md border border-border bg-workspace-pane p-4">
              <Badge variant="default" className="absolute right-3 top-3 gap-1">
                <CheckCircle className="size-3.5" />
                Active
              </Badge>
              <div className="flex items-center gap-2">
                {dataSourceConfig.type === 'remote' ? (
                  <CloudArrowDown className="size-[1.125rem] text-muted-foreground" />
                ) : (
                  <FolderOpen className="size-[1.125rem] text-muted-foreground" />
                )}
                <span className="text-sm font-medium capitalize">
                  {dataSourceConfig.type === 'remote' ? 'Remote URL' : 'Local Directory'}
                </span>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-24">Source:</span>
                <span className="text-xs font-mono break-all">{dataSourceConfig.path}</span>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-24">Last updated:</span>
                <span className="text-xs">{formatDateTime(lastDataChangedAt)}</span>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-24">Last checked:</span>
                <span className="text-xs">{formatDateTime(lastUpdateCheckAt)}</span>
              </div>

              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground min-w-24">Status:</span>
                <span className="text-xs">{getStatusLabel()}</span>
              </div>
            </div>
          ) : (
            <>
              {!selectorOnly && !hasActiveDataSource && (
                <div className="relative space-y-3 rounded-md border border-border bg-workspace-pane p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="size-[1.125rem] text-muted-foreground" />
                    <span className="text-sm font-medium">None</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No data source configured. Configure a remote URL or local directory below to
                    load game data.
                  </p>
                </div>
              )}

              {!selectorOnly && <Separator />}

              <Tabs
                value={sourceType}
                onValueChange={(v) => handleSourceTypeChange(v as 'local' | 'remote')}
              >
                <div className="mx-auto w-full max-w-xl">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="remote" className="gap-2">
                      <CloudArrowDown className="size-[1.125rem]" />
                      Remote URL
                    </TabsTrigger>
                    <TabsTrigger value="local" className="gap-2">
                      <FolderOpen className="size-[1.125rem]" />
                      Local Directory
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="remote" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={remotePathId}>Repository URL</Label>
                    <div className="relative">
                      <Input
                        id={remotePathId}
                        value={sourcePath}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        placeholder="https://github.com/username/example-data"
                        disabled={isLoading}
                        className={`pr-10 ${getValidationBorderClass()}`}
                      />
                      {validationStatus === 'validating' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="animate-spin h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                        </div>
                      )}
                      {validationStatus === 'valid' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <CheckCircle className="size-[1.125rem] text-success" />
                        </div>
                      )}
                      {validationStatus === 'invalid' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <XCircle className="size-[1.125rem] text-destructive" />
                        </div>
                      )}
                    </div>
                    {validationStatus === 'validating' && (
                      <p className="text-sm text-muted-foreground">Checking data source...</p>
                    )}
                    {validationStatus === 'valid' && (
                      <p className="text-sm text-success">✓ Valid data source ready to load</p>
                    )}
                    {validationStatus === 'invalid' && validationResult?.error && (
                      <p className="text-sm text-destructive">✗ {validationResult.error}</p>
                    )}
                    {validationStatus === 'idle' && (
                      <p className="text-sm text-muted-foreground">
                        Enter an HTTPS URL to a 5etools data repository
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="local" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={localPathId}>Local Path</Label>
                    <div className="flex gap-2">
                      <Input
                        id={localPathId}
                        value={sourcePath}
                        placeholder="/path/to/5etools/data"
                        readOnly
                        disabled={isLoading}
                        className={`flex-1 ${getValidationBorderClass()}`}
                      />
                      <Button
                        onClick={handleSelectFolder}
                        disabled={isValidating || isLoading}
                        variant="outline"
                        className="gap-2 shrink-0"
                      >
                        <FolderOpen className="size-4" />
                        {isValidating ? 'Selecting...' : 'Select Folder'}
                      </Button>
                    </div>
                    {validationStatus === 'validating' && (
                      <p className="text-sm text-muted-foreground">Checking data source...</p>
                    )}
                    {validationStatus === 'valid' && (
                      <p className="text-sm text-success">✓ Valid data source ready to load</p>
                    )}
                    {validationStatus === 'invalid' && validationResult?.error && (
                      <p className="text-sm text-destructive">✗ {validationResult.error}</p>
                    )}
                    {validationStatus === 'idle' && (
                      <p className="text-sm text-muted-foreground">
                        Path to the directory containing 5etools data files
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}

          <div className="flex gap-2">
            {!selectorOnly && (
              <Button
                onClick={handleClear}
                disabled={isLoading || !hasActiveDataSource}
                variant="destructive"
                className="gap-2"
              >
                <Trash className="size-4" />
                Clear Data
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              {!selectorOnly && hasActiveDataSource && !isSelectingDataSource && (
                <Button
                  onClick={() => {
                    autoOpenedSelectorRef.current = false
                    setIsSelectingDataSource(true)
                  }}
                  disabled={isLoading || selectorOnly}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowsLeftRight className="size-4" />
                  Change Source
                </Button>
              )}
              {!selectorOnly && hasActiveDataSource && isSelectingDataSource && (
                <Button
                  onClick={() => {
                    setIsSelectingDataSource(false)
                    setSourcePath('')
                    setValidationStatus('idle')
                    setValidationResult(null)
                  }}
                  disabled={isLoading}
                  variant="outline"
                >
                  Cancel
                </Button>
              )}
              {!selectorOnly && !isSelectingDataSource && (
                <Button
                  onClick={handleRefresh}
                  disabled={isLoading || !hasActiveDataSource}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowClockwise className="size-4" />
                  Update Data
                </Button>
              )}
              {(!hasActiveDataSource || isSelectingDataSource || selectorOnly) && (
                <Button
                  onClick={handleSaveConfig}
                  disabled={isLoading || !sourcePath || !isValidSource}
                  variant="outline"
                  className={`gap-2 ${!isLoading && sourcePath && isValidSource ? '!bg-success !text-success-foreground !border-success hover:!bg-success/90 hover:!border-success/90' : 'text-muted-foreground'}`}
                >
                  <Database className="size-4" />
                  {isLoading ? 'Saving...' : 'Save & Load'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {!selectorOnly && (
        <Section
          title="Auto-refresh on Launch"
          description="Automatically check for game data updates when the app starts."
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Enable auto-refresh</p>
            <Switch checked={autoRefreshGameData} onCheckedChange={setAutoRefreshGameData} />
          </div>
        </Section>
      )}

      {isLoading && loadProgress && (
        <div className="rounded-md border border-primary/50 bg-workspace-pane p-4">
          <div className="flex items-center gap-3">
            <div className="animate-pulse rounded-md bg-primary/10 p-2">
              <Database className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Loading Game Data</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loadProgress.resource} ({loadProgress.current} of {loadProgress.total})
              </p>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {getProgressPercent()}%
            </Badge>
          </div>
          <Progress value={getProgressPercent()} className="mt-3 h-2" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <Warning className="size-[1.125rem]" />
          <AlertTitle>Loading Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
