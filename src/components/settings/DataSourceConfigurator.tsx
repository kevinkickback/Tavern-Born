import {
  ArrowClockwise,
  ArrowLeft,
  ArrowsLeftRight,
  BookOpen,
  CheckCircle,
  CloudArrowDown,
  Database,
  FolderOpen,
  Warning,
  XCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Section } from '@/components/workspace'
import { resolveDefaultBundledSource } from '@/lib/5etools/bundledSource'
import { prepareCatalogCandidate, releaseCatalogCandidate } from '@/lib/5etools/catalogClient'
import type { CatalogCandidate } from '@/lib/5etools/catalogProtocol'
import { parseRemoteDataSourceUrl } from '@/lib/5etools/urlUtils'
import { settleOnAbort } from '@/lib/abortable'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import { INTERACTIVE_CATALOG_TIMEOUT_MS, useGameDataStore } from '@/store/gameDataStore'
import { CatalogCharacterImpact } from './CatalogCharacterImpact'

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid'
type BundledManifest = Awaited<ReturnType<Window['electronAPI']['getBundledManifest']>>

type DataSourceConfiguratorProps = {
  selectorOnly?: boolean
  showAdditionalContentGuidance?: boolean
  onSourceLoaded?: () => void
  onCancel?: () => void
}

function discardFolder(root: string | null) {
  if (root) window.electronAPI?.discardLocalDataRoot?.(root)
}
export function DataSourceConfigurator({
  selectorOnly = false,
  showAdditionalContentGuidance = false,
  onSourceLoaded,
  onCancel,
}: DataSourceConfiguratorProps) {
  const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig)
  const gameData = useGameDataStore((state) => state.gameData)
  const isLoading = useGameDataStore((state) => state.isLoading)
  const isBackgroundRefreshing = useGameDataStore((state) => state.isBackgroundRefreshing)
  const error = useGameDataStore((state) => state.error)
  const lastDataChangedAt = useGameDataStore((state) => state.lastDataChangedAt)
  const lastUpdateCheckAt = useGameDataStore((state) => state.lastUpdateCheckAt)
  const usingSessionSrd = useGameDataStore((state) => state.sessionBundledSource !== null)
  const loadCatalog = useGameDataStore((state) => state.loadCatalog)
  const pending = useGameDataStore((state) => state.pendingCatalog)
  const previousCatalog = useGameDataStore((state) => state.previousCatalog)
  const rollbackCatalog = useGameDataStore((state) => state.rollbackCatalog)
  const isCatalogActivating = useGameDataStore((state) => state.isCatalogActivating)
  const catalogWarnings = useGameDataStore((state) => state.catalogWarnings)
  const hasUnsavedChanges = useCharacterStore((state) => state.hasUnsavedChanges())
  const restoreBundledData = useGameDataStore((state) => state.restoreBundledData)
  const hasActiveDataSource = dataSourceConfig?.isValid && gameData !== null
  const autoRefreshGameData = useAppPreferencesStore((state) => state.autoRefreshGameData)
  const setAutoRefreshGameData = useAppPreferencesStore((state) => state.setAutoRefreshGameData)

  const [sourceType, setSourceType] = useState<'local' | 'remote'>(
    dataSourceConfig?.type === 'local' ? 'local' : 'remote',
  )
  const [sourcePath, setSourcePath] = useState('')
  const [isSelectingDataSource, setIsSelectingDataSource] = useState(!hasActiveDataSource)
  const [isValidating, setIsValidating] = useState(false)
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [bundledManifest, setBundledManifest] = useState<BundledManifest | null>(null)
  const remotePathId = useId()
  const localPathId = useId()
  const [validationResult, setValidationResult] = useState<{
    error?: string
    candidate?: CatalogCandidate
    basis?: typeof dataSourceConfig
  } | null>(null)
  const validationController = useRef<AbortController | null>(null)
  const validationCandidate = useRef<CatalogCandidate | undefined>(undefined)
  const autoOpenedSelectorRef = useRef(!hasActiveDataSource)

  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const validationRequestRef = useRef(0)
  const previewFolder = useRef<string | null>(null)

  const handleSourceTypeChange = (newType: 'local' | 'remote') => {
    releaseCatalogCandidate(validationCandidate.current)
    validationCandidate.current = undefined
    discardFolder(previewFolder.current)
    previewFolder.current = null
    setSourceType(newType)
    setSourcePath(
      hasActiveDataSource && dataSourceConfig.type === newType ? dataSourceConfig.path : '',
    )
    setValidationStatus('idle')
    setIsValidating(false)
    setValidationResult(null)
    validationRequestRef.current += 1
    validationController.current?.abort()
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }
  }

  useEffect(() => {
    return () => {
      validationRequestRef.current += 1
      validationController.current?.abort()
      releaseCatalogCandidate(validationCandidate.current)
      discardFolder(previewFolder.current)
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const getBundledManifest = window.electronAPI?.getBundledManifest
    if (dataSourceConfig?.type !== 'bundled' || !getBundledManifest) {
      setBundledManifest(null)
      return
    }

    let active = true
    getBundledManifest()
      .then((manifest) => {
        if (
          active &&
          manifest.packId === dataSourceConfig.packId &&
          manifest.packVersion === dataSourceConfig.packVersion
        ) {
          setBundledManifest(manifest)
        }
      })
      .catch(() => {
        if (active) setBundledManifest(null)
      })
    return () => {
      active = false
    }
  }, [dataSourceConfig])

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
    releaseCatalogCandidate(validationCandidate.current)
    validationCandidate.current = undefined

    if (!path) {
      setValidationStatus('idle')
      setIsValidating(false)
      setValidationResult(null)
      return
    }

    setValidationStatus('validating')
    setIsValidating(true)

    validationController.current?.abort()
    const controller = new AbortController()
    validationController.current = controller
    const basis = useGameDataStore.getState().dataSourceConfig
    try {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(INTERACTIVE_CATALOG_TIMEOUT_MS),
      ])
      const base = useGameDataStore.getState().bundledUnavailable
        ? null
        : await settleOnAbort(resolveDefaultBundledSource(), signal)
      const candidate = await prepareCatalogCandidate(
        {
          ...(basis?.type === type && basis.path === path ? basis : null),
          type,
          path,
          isValid: false,
        },
        base ?? undefined,
        signal,
      )
      if (requestId !== validationRequestRef.current || controller.signal.aborted) {
        releaseCatalogCandidate(candidate)
        return
      }
      validationCandidate.current = candidate
      setValidationResult({ candidate, basis })
      setValidationStatus('valid')
    } catch (error) {
      if (requestId !== validationRequestRef.current || controller.signal.aborted) return

      setValidationResult({
        error:
          error instanceof DOMException || error instanceof Error ? error.message : 'Unknown error',
      })
      setValidationStatus('invalid')
      toast.error('Game data check failed')
    } finally {
      if (requestId === validationRequestRef.current) {
        setIsValidating(false)
      }
    }
  }

  const handleUrlChange = (value: string) => {
    releaseCatalogCandidate(validationCandidate.current)
    validationCandidate.current = undefined
    validationRequestRef.current += 1
    validationController.current?.abort()
    setSourcePath(value)
    setValidationStatus('idle')
    setIsValidating(false)
    setValidationResult(null)

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    if (value && sourceType === 'remote') {
      if (parseRemoteDataSourceUrl(value).kind !== 'invalid') {
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
    const requestId = validationRequestRef.current
    try {
      const selectFolder = window.electronAPI?.selectFolder
      if (!selectFolder) {
        toast.error('Folder picker is only available in the desktop app')
        return
      }

      const folderPath = await selectFolder()
      if (!folderPath) return
      useGameDataStore.getState().invalidatePendingFolderSelection()
      if (requestId !== validationRequestRef.current) {
        discardFolder(folderPath)
        return
      }
      previewFolder.current = folderPath
      setSourcePath(folderPath)
      performValidation(folderPath, 'local')
    } catch (error) {
      if (requestId !== validationRequestRef.current) return
      toast.error('Failed to select folder', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const applyCandidate = async (candidate: CatalogCandidate, confirmed = false) => {
    if (useCharacterStore.getState().hasUnsavedChanges()) {
      toast.info('Save or discard your character changes before switching game data.')
      return
    }
    const folderGrant =
      candidate.config.type === 'local' && previewFolder.current === candidate.config.path
        ? candidate.config.path
        : undefined
    if (validationCandidate.current === candidate) {
      validationCandidate.current = undefined
      setValidationStatus('idle')
      setValidationResult(null)
    }
    if (folderGrant) {
      previewFolder.current = null
      setValidationStatus('idle')
      setValidationResult(null)
    }
    const result = await loadCatalog(candidate.config, false, {
      prepared: candidate,
      confirmed,
      ...(folderGrant ? { folderGrant } : {}),
    })
    if (result.kind === 'applied' || result.kind === 'staged') {
      setIsSelectingDataSource(false)
      setSourcePath('')
      setValidationStatus('idle')
      setValidationResult(null)
    }
    if (result.kind === 'rejected') {
      toast.error('Could not apply game data', { description: result.message })
    } else if (result.kind === 'applied') {
      toast.success('Additional content loaded')
      onSourceLoaded?.()
    }
  }

  const handleSaveConfig = async () => {
    const candidate = validationResult?.candidate
    if (!candidate) return
    if (validationResult.basis !== useGameDataStore.getState().dataSourceConfig) {
      await performValidation(sourcePath, sourceType)
      return
    }
    await applyCandidate(candidate)
  }

  const handleRefresh = async () => {
    const { isLoading, isBackgroundRefreshing } = useGameDataStore.getState()
    if (!dataSourceConfig || isLoading || isBackgroundRefreshing) return
    const result = await loadCatalog(dataSourceConfig, true)
    if (result.kind === 'rejected') {
      toast.error('Couldn’t check your additional content', { description: result.message })
    } else if (result.kind === 'staged') {
      const reason = useGameDataStore.getState().pendingCatalog?.reason
      toast.info(
        reason === 'reload' || reason === 'recovery'
          ? 'Your additional content is ready to reload'
          : 'Review your additional content in Game Data',
      )
    } else if (result.kind === 'applied') toast.info('Game data is up to date')
  }
  const handleRestoreBundled = async () => {
    if (useCharacterStore.getState().hasUnsavedChanges()) {
      toast.info('Save or discard your character changes before switching game data.')
      return
    }
    try {
      const restored = await restoreBundledData()
      if (!restored) {
        toast.error('Unable to load the included SRD', {
          description:
            useGameDataStore.getState().error ?? 'The included SRD rules are unavailable.',
        })
        return
      }

      handleSourceTypeChange(sourceType)
      setIsSelectingDataSource(false)
      setSourcePath('')
      setValidationStatus('idle')
      setValidationResult(null)
      toast.success('Additional content removed', {
        description: 'The included 2014 and 2024 SRD rules remain ready to use.',
      })
      onSourceLoaded?.()
    } catch (restoreError) {
      toast.error('Unable to load the included SRD', {
        description: restoreError instanceof Error ? restoreError.message : 'Unknown error',
      })
    }
  }

  const isValidSource = validationStatus === 'valid'

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Not yet'
    return new Date(iso).toLocaleString()
  }

  const getValidationBorderClass = () => {
    if (validationStatus === 'validating') return 'border-muted-foreground/50'
    if (validationStatus === 'valid') return 'border-success'
    if (validationStatus === 'invalid') return 'border-destructive'
    return ''
  }

  const bundledSrdVersions =
    bundledManifest?.documents.map((document) => `SRD ${document.version}`).join(' and ') ??
    '2014 and 2024 SRD rules'

  return (
    <div className="min-w-0">
      <Section
        title={
          showAdditionalContentGuidance
            ? 'Choose a Source'
            : selectorOnly
              ? 'Choose Game Data'
              : 'Game Data'
        }
        description={
          showAdditionalContentGuidance
            ? 'Select 5etools compatible JSON data from the web or your computer.'
            : selectorOnly
              ? 'Enter a web address or select a folder containing 5etools-compatible JSON files.'
              : 'The Included SRD is always available. Add compatible content to expand your options.'
        }
        className="pt-0"
      >
        <div className="space-y-4">
          {!selectorOnly && hasActiveDataSource && !isSelectingDataSource ? (
            <div className="relative space-y-3 rounded-md border border-border bg-workspace-pane p-4">
              <Badge variant="default" className="absolute right-3 top-3 gap-1">
                <CheckCircle className="size-3.5" />
                {usingSessionSrd ? 'Configured' : 'Active'}
              </Badge>
              {usingSessionSrd && (
                <p className="text-sm text-warning">Using Included SRD for this session.</p>
              )}
              <div className="flex items-center gap-2">
                {dataSourceConfig.type === 'bundled' ? (
                  <Database className="size-[1.125rem] text-muted-foreground" />
                ) : dataSourceConfig.type === 'remote' ? (
                  <CloudArrowDown className="size-[1.125rem] text-muted-foreground" />
                ) : (
                  <FolderOpen className="size-[1.125rem] text-muted-foreground" />
                )}
                <span className="text-sm font-medium capitalize">
                  {dataSourceConfig.type === 'bundled'
                    ? 'Included SRD Rules'
                    : dataSourceConfig.type === 'remote'
                      ? 'Online Additional Content'
                      : 'Additional Content on This Computer'}
                </span>
              </div>

              <dl>
                {(dataSourceConfig.type === 'bundled'
                  ? [
                      ['SRD versions', bundledSrdVersions],
                      ['Character rules', '2014 and 2024'],
                      ['Internet', 'Not required'],
                    ]
                  : [
                      ['Location', dataSourceConfig.path],
                      ['Last Updated', formatDateTime(lastDataChangedAt)],
                      ['Last Checked', formatDateTime(lastUpdateCheckAt)],
                    ]
                ).map(
                  ([label, value]) =>
                    value && (
                      <div key={label} className="flex gap-2 break-all text-xs">
                        <dt className="min-w-24 text-muted-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ),
                )}
              </dl>
            </div>
          ) : (
            <>
              <Tabs
                value={sourceType}
                onValueChange={(v) => handleSourceTypeChange(v as 'local' | 'remote')}
              >
                <div className="mx-auto w-full max-w-xl">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="remote" className="gap-2">
                      <CloudArrowDown className="size-[1.125rem]" />
                      Online
                    </TabsTrigger>
                    <TabsTrigger value="local" className="gap-2">
                      <FolderOpen className="size-[1.125rem]" />
                      This Computer
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="remote" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={remotePathId}>Web Address</Label>
                    <div className="relative">
                      <Input
                        id={remotePathId}
                        value={sourcePath}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        placeholder="https://example.com/game-data"
                        onBlur={() => {
                          const result = parseRemoteDataSourceUrl(sourcePath)
                          if (sourcePath.trim() && result.kind === 'invalid') {
                            setValidationStatus('invalid')
                            setValidationResult({ error: result.error })
                          }
                        }}
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
                  </div>
                </TabsContent>
                <TabsContent value="local" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor={localPathId}>Folder</Label>
                    <div className="flex gap-2">
                      <Input
                        id={localPathId}
                        value={sourcePath}
                        placeholder="Choose a folder containing 5etools data"
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
                  </div>
                </TabsContent>
              </Tabs>
              <div aria-live="polite">
                {validationStatus === 'validating' && <p>Checking compatibility...</p>}
                {validationStatus === 'valid' && (
                  <p className="text-success">Compatible game data found</p>
                )}
                {validationResult?.error && (
                  <p className="text-destructive">{validationResult.error}</p>
                )}
              </div>
              {validationStatus === 'valid' && !!validationResult?.candidate?.warnings.length && (
                <p className="text-sm text-warning">
                  Some optional content is unavailable. {validationResult?.candidate?.warnings[0]}
                </p>
              )}
              {showAdditionalContentGuidance && (
                <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <BookOpen className="mt-0.5 size-4 shrink-0 text-primary" weight="duotone" />
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Not sure where to begin? The{' '}
                    <a
                      href="https://wiki.tercept.net/en/5eTools/InstallGuide#step-1-downloading-the-site"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      5etools community wiki
                    </a>{' '}
                    might know a thing or two about finding compatible files.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2">
            {selectorOnly && onCancel && (
              <Button onClick={onCancel} disabled={isLoading} variant="outline" className="gap-2">
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
            {hasActiveDataSource &&
              dataSourceConfig.type !== 'bundled' &&
              isSelectingDataSource && (
                <Button
                  onClick={() => setConfirmRevertOpen(true)}
                  className="border-warning/50"
                  disabled={isLoading || hasUnsavedChanges}
                  variant="outline"
                >
                  Remove Additional Content
                </Button>
              )}
            <div className="flex gap-2 ml-auto">
              {!selectorOnly && hasActiveDataSource && !isSelectingDataSource && (
                <Button
                  onClick={() => {
                    if (dataSourceConfig.type !== 'bundled')
                      handleSourceTypeChange(dataSourceConfig.type)
                    autoOpenedSelectorRef.current = false
                    setIsSelectingDataSource(true)
                  }}
                  disabled={isLoading}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowsLeftRight className="size-4" />
                  {dataSourceConfig.type === 'bundled'
                    ? 'Add Additional Content'
                    : 'Change Additional Content'}
                </Button>
              )}
              {!selectorOnly && hasActiveDataSource && isSelectingDataSource && (
                <Button
                  onClick={() => {
                    handleSourceTypeChange(sourceType)
                    setIsSelectingDataSource(false)
                  }}
                  disabled={isLoading}
                  variant="outline"
                >
                  Cancel
                </Button>
              )}
              {!selectorOnly && !isSelectingDataSource && dataSourceConfig?.type !== 'bundled' && (
                <Button
                  onClick={handleRefresh}
                  disabled={isLoading || isBackgroundRefreshing || !hasActiveDataSource}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowClockwise
                    className={cn('size-4', isBackgroundRefreshing && 'motion-safe:animate-spin')}
                    aria-hidden
                  />
                  {isBackgroundRefreshing ? 'Checking for updates…' : 'Check for Updates'}
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
                  {isLoading ? 'Loading...' : 'Add Additional Content'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {!selectorOnly && !isSelectingDataSource && dataSourceConfig?.type !== 'bundled' && (
        <Section
          title="Automatic update checks"
          description="Tavern Born checks about once a day when you open or return to the app. If a check fails, it waits before trying again."
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Check automatically</p>
            <Switch checked={autoRefreshGameData} onCheckedChange={setAutoRefreshGameData} />
          </div>
        </Section>
      )}

      {!selectorOnly && previousCatalog && (
        <Section
          title="Previous game data"
          description="Restore the last saved catalog and its source settings."
        >
          <Button
            variant="outline"
            disabled={isLoading || isCatalogActivating || hasUnsavedChanges}
            onClick={() => setConfirmRollback(true)}
          >
            Restore previous game data
          </Button>
          <AlertDialog open={confirmRollback} onOpenChange={setConfirmRollback}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore previous game data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tavern Born will load the previous game data and its saved source settings.
                  Character choices already changed under other rules may need to be selected again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (await rollbackCatalog()) toast.success('Previous game data restored')
                  }}
                >
                  Restore
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>
      )}
      {pending && (
        <Section
          id={selectorOnly ? undefined : 'game-data-update'}
          tabIndex={-1}
          title={
            pending.reason === 'reload' || pending.reason === 'recovery'
              ? 'Reload your additional content'
              : pending.reason === 'review'
                ? 'Review your additional content'
                : 'Review changes to your game data'
          }
        >
          <p className="text-sm">
            {pending.reason === 'reload'
              ? 'The rebuilt game data matches the rules you last used. Reload it to use your additional content again.'
              : pending.reason === 'recovery'
                ? 'Your additional content is ready to reload. Review any notes below before continuing.'
                : 'Review these notes before applying. Your saved characters stay in your library.'}
          </p>
          {pending.incompleteRemovalPreview && (
            <p className="text-sm">
              Tavern Born couldn’t compare the full list of files and entries from your previous
              source. This preview may miss some removals.
            </p>
          )}
          {!!pending.additions?.length && (
            <details className="text-sm">
              <summary>See what this source now provides</summary>
              <ul className="max-h-48 overflow-y-auto">
                {pending.additions.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </details>
          )}
          {!!pending.removals.length && (
            <details className="text-sm">
              <summary>See what this source no longer provides</summary>
              <ul className="max-h-48 overflow-y-auto">
                {pending.removals.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </details>
          )}
          {pending.reason !== 'reload' && <CatalogCharacterImpact candidate={pending.candidate} />}
          <Button
            disabled={hasUnsavedChanges || isLoading}
            onClick={() => void applyCandidate(pending.candidate, true)}
          >
            {pending.reason === 'reload' || pending.reason === 'recovery'
              ? 'Reload additional content'
              : 'Apply game data update'}
          </Button>
          {hasUnsavedChanges && (
            <p className="text-sm">Save or discard your character changes before continuing.</p>
          )}
        </Section>
      )}
      {!!catalogWarnings.length && (
        <details className="text-sm">
          <summary>Some extra content couldn’t be loaded</summary>
          <ul>
            {catalogWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <Alert variant="destructive">
          <Warning className="size-[1.125rem]" />
          <AlertTitle>
            {hasActiveDataSource ? 'Source check failed' : 'Game data unavailable'}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={confirmRevertOpen} onOpenChange={setConfirmRevertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove additional content?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved connection to your additional content. The Included SRD and
              your characters will remain, but choices that depend on the removed content may be
              unavailable until you add it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Keep Additional Content</AlertDialogCancel>
            <AlertDialogAction disabled={isLoading} onClick={() => void handleRestoreBundled()}>
              Remove Additional Content
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
