import { CheckCircle, Database, PlusCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGameDataStore } from '@/store/gameDataStore'
import { DataSourceConfigurator } from './DataSourceConfigurator'

const FORCE_KEY = 'tb:force-setup'
const BUNDLED_INTRO_KEY = 'tb:bundled-srd-intro:v1'

/**
 * Introduces the bundled SRD once, or gates the app when no game data is available.
 *
 * Shows when:
 *  - Store has fully hydrated from IDB, and
 *  - an active bundled source has not been introduced yet, or
 *  - gameData is null after loading finishes.
 *
 * Can also be forced open via `localStorage.setItem('tb:force-setup', '1')` + reload.
 */
export function DataSourceStartupModal() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const cacheStatus = useGameDataStore((s) => s.cacheStatus)
  const error = useGameDataStore((s) => s.error)
  const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig)

  const [isForced] = useState(() => Boolean(localStorage.getItem(FORCE_KEY)))
  const [hasAcknowledgedBundledIntro, setHasAcknowledgedBundledIntro] = useState(() =>
    Boolean(localStorage.getItem(BUNDLED_INTRO_KEY)),
  )
  const [showExternalSetup, setShowExternalSetup] = useState(false)
  const [open, setOpen] = useState(false)
  const isBundledReady = Boolean(gameData && dataSourceConfig?.type === 'bundled')
  const showBundledIntro =
    !isForced && isBundledReady && !hasAcknowledgedBundledIntro && !showExternalSetup
  const needsSetup = !gameData && !isLoading
  const shouldShowSelectorOnly = !isForced && (needsSetup || showExternalSetup)

  // Wait for both IDB hydration AND useDataInit to finish resolving the cache
  // status.  While cacheStatus is still 'unknown', the init hook is reading
  // the IDB cache — opening here would cause a brief flash before gameData
  // arrives.  If there's a load error, allow the modal through so the user
  // can reconfigure.
  useEffect(() => {
    if (!hasHydrated) return
    if (cacheStatus === 'unknown' && !error) return
    setOpen(isForced || needsSetup || showBundledIntro || showExternalSetup)
  }, [hasHydrated, cacheStatus, error, isForced, needsSetup, showBundledIntro, showExternalSetup])

  const acknowledgeBundledIntro = () => {
    localStorage.setItem(BUNDLED_INTRO_KEY, '1')
    setHasAcknowledgedBundledIntro(true)
  }

  const handleContinueWithBundled = () => {
    acknowledgeBundledIntro()
    setOpen(false)
  }

  const handleAddMoreContent = () => {
    acknowledgeBundledIntro()
    setShowExternalSetup(true)
  }

  const handleSourceLoaded = () => {
    acknowledgeBundledIntro()
    setShowExternalSetup(false)
    if (!isForced) setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !isForced && (needsSetup || showBundledIntro || showExternalSetup)) {
      return
    }
    if (!next && isForced) {
      localStorage.removeItem(FORCE_KEY)
    }
    setOpen(next)
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 gap-2 border-b border-border bg-surface-raised px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
              <Database className="size-5" weight="duotone" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg">
                {isForced
                  ? 'Game Data Setup'
                  : showBundledIntro
                    ? 'Welcome to Tavern Born'
                    : 'Choose a Game Data Source'}
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {showBundledIntro
                  ? 'The included SRD rules are ready to use offline.'
                  : 'Choose the rules data used by the character builder.'}
              </p>
            </div>
          </div>
          <DialogDescription className="pt-1 leading-relaxed">
            {isForced
              ? 'Reconfigure your data source. Close when done.'
              : showBundledIntro
                ? 'Tavern Born includes SRD 5.1 and SRD 5.2.1 for 2014 and 2024 characters. No download or folder selection is required.'
                : showExternalSetup
                  ? 'External content is supplied by you and replaces the bundled presentation catalog. Tavern Born does not distribute that content.'
                  : 'The bundled SRD could not be loaded. Try it again or choose a user-supplied external 5etools source.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {showBundledIntro ? (
            <div className="space-y-5">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 size-5 shrink-0 text-primary" weight="fill" />
                  <div>
                    <p className="text-sm font-medium">Bundled SRD 5.1 + 5.2.1</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Create both 2014 and 2024 characters with the included open rules. You can
                      change the source later in Settings.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="gap-2" onClick={handleAddMoreContent}>
                  <PlusCircle className="size-4" />
                  Add More Content
                </Button>
                <Button className="gap-2" onClick={handleContinueWithBundled}>
                  <Database className="size-4" />
                  Continue with Bundled SRD
                </Button>
              </div>
            </div>
          ) : (
            <DataSourceConfigurator
              selectorOnly={shouldShowSelectorOnly}
              onSourceLoaded={handleSourceLoaded}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
