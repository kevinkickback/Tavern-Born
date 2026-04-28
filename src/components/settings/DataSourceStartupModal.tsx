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
      // Block closing when there is genuinely no data available.
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
        className="max-w-3xl max-h-[90vh] overflow-y-auto [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isForced ? 'Data Source Setup' : 'Welcome to Tavern Born'}
          </DialogTitle>
          <DialogDescription>
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

        <DataSourceConfigurator selectorOnly={shouldShowSelectorOnly} />
      </DialogContent>
    </Dialog>
  )
}
