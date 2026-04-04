import { useState, useEffect, useRef } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import { validateDataSource } from '@/lib/5etools'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Database,
  CloudArrowDown,
  FolderOpen,
  CheckCircle,
  XCircle,
  Warning,
  ArrowClockwise,
  MagnifyingGlass,
  Trash,
  Flask,
} from '@phosphor-icons/react'

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'

export function DataSourceConfigurator() {
  const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig)
  const gameData = useGameDataStore((state) => state.gameData)
  const isLoading = useGameDataStore((state) => state.isLoading)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)
  const lastLoadedAt = useGameDataStore((state) => state.lastLoadedAt)
  const loadGameData = useGameDataStore((state) => state.loadGameData)
  const refreshGameData = useGameDataStore((state) => state.refreshGameData)
  const clearGameData = useGameDataStore((state) => state.clearGameData)

  const [sourceType, setSourceType] = useState<'local' | 'remote'>(
    dataSourceConfig?.type || 'remote'
  )
  const [sourcePath, setSourcePath] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean
    error?: string
    foundResources?: string[]
    normalizedPath?: string
  } | null>(null)

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

  const handleValidate = () => {
    performValidation(sourcePath, sourceType)
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
      const folderPath = await window.electronAPI.selectFolder()
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

      toast.success('Data source updated and loaded!', {
        description: 'Game data is now available',
      })
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
    try {
      await refreshGameData()
      toast.success('Game data refreshed successfully!')
    } catch (error) {
      toast.error('Failed to refresh game data')
    }
  }

  const handleClear = () => {
    clearGameData()
    setSourcePath('')
    setValidationStatus('idle')
    setValidationResult(null)
    toast.info('Game data cleared')
  }

  const hasActiveDataSource = dataSourceConfig && dataSourceConfig.isValid && gameData !== null

  const getProgressPercent = () => {
    if (!loadProgress) return 0
    return Math.round((loadProgress.current / loadProgress.total) * 100)
  }

  const isValidSource = validationStatus === 'valid'

  const getValidationBorderClass = () => {
    if (validationStatus === 'validating') return 'border-muted-foreground/50'
    if (validationStatus === 'valid') return 'border-success'
    if (validationStatus === 'invalid') return 'border-destructive'
    return ''
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database size={24} className="text-primary" />
            </div>
            <div>
              <CardTitle>Data Source Configuration</CardTitle>
              <CardDescription>
                Configure where to load 5etools game data from
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="relative space-y-3 bg-muted/50 p-4 rounded-lg">
              {hasActiveDataSource && (
                <Badge variant="default" className="gap-1 absolute top-3 right-3">
                  <CheckCircle size={14} />
                  Active
                </Badge>
              )}
              <div className="flex items-center gap-2">
                {hasActiveDataSource ? (
                  dataSourceConfig.type === 'remote' ? (
                    <CloudArrowDown size={18} className="text-muted-foreground" />
                  ) : (
                    <FolderOpen size={18} className="text-muted-foreground" />
                  )
                ) : (
                  <XCircle size={18} className="text-muted-foreground" />
                )}
                <span className="text-sm font-medium capitalize">
                  {hasActiveDataSource
                    ? (dataSourceConfig.type === 'remote' ? 'Remote URL' : 'Local Directory')
                    : 'None'}
                </span>
              </div>

              {hasActiveDataSource && (
                <>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground min-w-24">
                      {dataSourceConfig.type === 'remote' ? 'URL:' : 'Path:'}
                    </span>
                    <span className="text-xs font-mono break-all">
                      {dataSourceConfig.path}
                    </span>
                  </div>

                  {lastLoadedAt && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground min-w-24">Last Loaded:</span>
                      <span className="text-xs">
                        {new Date(lastLoadedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}

              {!hasActiveDataSource && (
                <p className="text-xs text-muted-foreground">
                  No data source configured. Configure a remote URL or local directory below to load game data.
                </p>
              )}
            </div>
          </div>

          <Separator />

          <Tabs value={sourceType} onValueChange={(v) => handleSourceTypeChange(v as 'local' | 'remote')}>
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
                <Label htmlFor="remote-path">Repository URL</Label>
                <div className="relative">
                  <Input
                    id="remote-path"
                    value={sourcePath}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master"
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
                  <p className="text-sm text-muted-foreground">
                    Checking data source...
                  </p>
                )}
                {validationStatus === 'valid' && (
                  <p className="text-sm text-success">
                    ✓ Valid data source ready to load
                  </p>
                )}
                {validationStatus === 'invalid' && validationResult?.error && (
                  <p className="text-sm text-destructive">
                    ✗ {validationResult.error}
                  </p>
                )}
                {validationStatus === 'idle' && (
                  <p className="text-sm text-muted-foreground">
                    URL to the 5etools GitHub repository or mirror
                  </p>
                )}
              </div>
            </TabsContent>
            <TabsContent value="local" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="local-path">Local Path</Label>
                <div className="flex gap-2">
                  <Input
                    id="local-path"
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
                  <p className="text-sm text-muted-foreground">
                    Checking data source...
                  </p>
                )}
                {validationStatus === 'valid' && (
                  <p className="text-sm text-success">
                    ✓ Valid data source ready to load
                  </p>
                )}
                {validationStatus === 'invalid' && validationResult?.error && (
                  <p className="text-sm text-destructive">
                    ✗ {validationResult.error}
                  </p>
                )}
                {validationStatus === 'idle' && (
                  <p className="text-sm text-muted-foreground">
                    Path to the directory containing 5etools JSON files
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-2">
            <Button onClick={handleClear} disabled={isLoading || !hasActiveDataSource} variant="destructive" className="gap-2">
              <Trash size={16} />
              Clear Data
            </Button>
            <div className="flex gap-2 ml-auto">
              <Button onClick={handleRefresh} disabled={isLoading || !hasActiveDataSource} variant="outline" className="gap-2">
                <ArrowClockwise size={16} />
                Update Data
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={isLoading || !sourcePath || !isValidSource}
                variant="outline"
                className={`gap-2 ${!isLoading && sourcePath && isValidSource ? '!bg-success !text-success-foreground !border-success hover:!bg-success/90 hover:!border-success/90' : 'text-muted-foreground'}`}
              >
                <Database size={16} />
                {isLoading ? 'Saving...' : 'Save & Load'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
