import {
  ArrowClockwise,
  ArrowsLeftRight,
  CheckCircle,
  CloudArrowDown,
  Database,
  FolderOpen,
  Repeat,
  Trash,
  Warning,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { validateDataSource } from '@/lib/5etools'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

type DataSourceConfiguratorProps = {
  selectorOnly?: boolean
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

  const handleSourceTypeChange = (newType: 'local' | 'remote') => {
    setSourceType(newType)
    setSourcePath('')
    setValidationStatus('idle')
    setValidationResult(null)
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

    // If selector mode was auto-opened due to missing data (startup/clear),
    // close it once a valid source is loaded so active details are shown.
    if (autoOpenedSelectorRef.current && !selectorOnly) {
      setIsSelectingDataSource(false)
      autoOpenedSelectorRef.current = false
    }
  }, [hasActiveDataSource, selectorOnly])

  const performValidation = async (path: string, type: 'local' | 'remote') => {
    if (!path) {
      setValidationStatus('idle')
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

      setValidationResult(result)
      setValidationStatus(result.isValid ? 'valid' : 'invalid')

      if (!result.isValid) {
        toast.error('Data source validation failed', {
          description: result.error,
        })
      }
    } catch (error) {
      setValidationResult({
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      setValidationStatus('invalid')
      toast.error('Validation failed')
    } finally {
      setIsValidating(false)
    }
  }

  const handleLocalPathChange = (value: string) => {
    setSourcePath(value)
    setValidationStatus('idle')
    setValidationResult(null)

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    if (value) {
      validationTimeoutRef.current = setTimeout(() => {
        performValidation(value, 'local')
      }, 1000)
    }
  }

  const handleUrlChange = (value: string) => {
    setSourcePath(value)
    setValidationStatus('idle')
    setValidationResult(null)

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    if (value && sourceType === 'remote') {
      try {
        new URL(value)
        validationTimeoutRef.current = setTimeout(() => {
          performValidation(value, 'remote')
        }, 1500)
      } catch {
        setValidationStatus('idle')
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
      await loadGameData(dataSourceConfig, true)
      const newChangedAt = useGameDataStore.getState().lastDataChangedAt
      if (newChangedAt !== previousChangedAt) {
        toast.success('Game data updated successfully!')
      } else {
        toast.info('Data is already up to date')
      }
    } catch (_error) {
      toast.error('Failed to check for updates')
    }
  }

  const handleClear = () => {
    autoOpenedSelectorRef.current = true
    clearGameData()
    setIsSelectingDataSource(true)
    setSourcePath('')
    setValidationStatus('idle')
    setValidationResult(null)
    toast.info('Game data cleared')
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" weight="duotone" />
            <CardTitle className="text-base">Data Source Configuration</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Configure where to load game data from</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selectorOnly && hasActiveDataSource && !isSelectingDataSource ? (
            <div className="relative space-y-3 bg-muted/50 p-4 rounded-lg">
              <Badge variant="default" className="gap-1 absolute top-3 right-3">
                <CheckCircle size={14} />
                Active
              </Badge>
              <div className="flex items-center gap-2">
                {dataSourceConfig.type === 'remote' ? (
                  <CloudArrowDown size={18} className="text-muted-foreground" />
                ) : (
                  <FolderOpen size={18} className="text-muted-foreground" />
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
                <div className="relative space-y-3 bg-muted/50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <XCircle size={18} className="text-muted-foreground" />
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
                <div className="flex justify-center">
                  <div className="w-1/2 min-w-[280px]">
                    <TabsList className="grid grid-cols-2 w-full">
                      <TabsTrigger value="remote" className="gap-2">
                        <CloudArrowDown size={18} />
                        Remote URL
                      </TabsTrigger>
                      <TabsTrigger value="local" className="gap-2">
                        <FolderOpen size={18} />
                        Local Directory
                      </TabsTrigger>
                    </TabsList>
                  </div>
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
                          <CheckCircle size={18} className="text-success" />
                        </div>
                      )}
                      {validationStatus === 'invalid' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <XCircle size={18} className="text-destructive" />
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
                        Enter URL to a 5etools data repository
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
                        onChange={(e) => handleLocalPathChange(e.target.value)}
                        placeholder="/path/to/5etools/data"
                        disabled={isLoading}
                        className={`flex-1 ${getValidationBorderClass()}`}
                      />
                      <Button
                        onClick={handleSelectFolder}
                        disabled={isValidating || isLoading}
                        variant="outline"
                        className="gap-2 shrink-0"
                      >
                        <FolderOpen size={16} />
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
                <Trash size={16} />
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
                  <ArrowsLeftRight size={16} />
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
                  <ArrowClockwise size={16} />
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
                  <Database size={16} />
                  {isLoading ? 'Saving...' : 'Save & Load'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectorOnly && (
        <Card>
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" weight="duotone" />
              <CardTitle className="text-base">Auto-refresh on Launch</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatically check for game data updates when the app starts.
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Enable auto-refresh</p>
              <Switch checked={autoRefreshGameData} onCheckedChange={setAutoRefreshGameData} />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && loadProgress && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 animate-pulse">
                <Database size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">Loading Game Data</CardTitle>
                <CardDescription>
                  {loadProgress.resource} ({loadProgress.current} of {loadProgress.total})
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-mono">
                {getProgressPercent()}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={getProgressPercent()} className="h-2" />
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <Warning size={18} />
          <AlertTitle>Loading Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
