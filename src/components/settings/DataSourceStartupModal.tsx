import { Database } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
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

/**
 * Modal that gates the app until game data is available.
 *
 * Shows when:
 *  - Store has fully hydrated from IDB, AND
 *  - gameData is null (not loaded from cache or source), AND
 *  - data is not currently loading.
 *
 * Can also be forced open via `localStorage.setItem('tb:force-setup', '1')` + reload.
 */
export function DataSourceStartupModal() {
  const hasHydrated = useGameDataStore((s) => s.hasHydrated)
  const gameData = useGameDataStore((s) => s.gameData)
  const isLoading = useGameDataStore((s) => s.isLoading)
  const cacheStatus = useGameDataStore((s) => s.cacheStatus)
  const error = useGameDataStore((s) => s.error)

  const [isForced] = useState(() => Boolean(localStorage.getItem(FORCE_KEY)))
  const shouldShowSelectorOnly = !isForced && !gameData
  const [open, setOpen] = useState(false)

  // Wait for both IDB hydration AND useDataInit to finish resolving the cache
  // status.  While cacheStatus is still 'unknown', the init hook is reading
  // the IDB cache — opening here would cause a brief flash before gameData
  // arrives.  If there's a load error, allow the modal through so the user
  // can reconfigure.
  useEffect(() => {
    if (!hasHydrated) return
    if (cacheStatus === 'unknown' && !error) return
    const needsSetup = !gameData && !isLoading
    setOpen(isForced || needsSetup)
  }, [hasHydrated, gameData, isLoading, isForced, cacheStatus, error])

  const handleOpenChange = (next: boolean) => {
    if (!next && !gameData && !isLoading && !isForced) {
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
                {isForced ? 'Game Data Setup' : 'Welcome to Tavern Born'}
              </DialogTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect the rules data used by the character builder.
              </p>
            </div>
          </div>
          <DialogDescription className="pt-1 leading-relaxed">
            {isForced ? (
              'Reconfigure your data source. Close when done.'
            ) : (
              <>
                This application requires 5etools D&D data files to operate. These files are not
                included and must be obtained separately. The{' '}
                <a
                  href="https://wiki.tercept.net/en/home"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  5etools wiki
                </a>{' '}
                (see: Download the Source code) might be helpful.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <DataSourceConfigurator selectorOnly={shouldShowSelectorOnly} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
