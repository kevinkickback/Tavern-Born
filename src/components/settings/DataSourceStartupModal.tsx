import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { useGameDataStore } from '@/store/gameDataStore'
import { DataSourceConfigurator } from './DataSourceConfigurator'

const FORCE_KEY = 'tb:force-setup'

/** Returns true if the startup prompt should be shown. */
function shouldShowSetup(hasDataSource: boolean): boolean {
    if (localStorage.getItem(FORCE_KEY)) return true
    return !hasDataSource
}

/**
 * Modal that appears on launch when no data source is configured.
 * Can also be forced open via `localStorage.setItem('tb:force-setup', '1')` + reload.
 * When forced, it is dismissible and clears the flag on close.
 */
export function DataSourceStartupModal() {
    const gameData = useGameDataStore((s) => s.gameData)
    const dataSourceConfig = useGameDataStore((s) => s.dataSourceConfig)
    const hasDataSource = dataSourceConfig !== null && dataSourceConfig.isValid && gameData !== null

    const [open, setOpen] = useState(() => shouldShowSetup(hasDataSource))
    const [isForced] = useState(() => Boolean(localStorage.getItem(FORCE_KEY)))

    // Auto-close once a data source is successfully loaded (non-forced flow).
    useEffect(() => {
        if (hasDataSource && !isForced) {
            setOpen(false)
        }
    }, [hasDataSource, isForced])

    const handleOpenChange = (next: boolean) => {
        if (!next && !hasDataSource && !isForced) {
            // Don't allow dismissal when there's genuinely no data source.
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
                className="max-w-3xl max-h-[90vh] overflow-y-auto"
                // Prevent closing via Escape/overlay when no data source and not forced.
                onPointerDownOutside={(e) => {
                    if (!hasDataSource && !isForced) e.preventDefault()
                }}
                onEscapeKeyDown={(e) => {
                    if (!hasDataSource && !isForced) e.preventDefault()
                }}
            >
                <DialogHeader>
                    <DialogTitle className="font-display text-2xl">
                        {isForced ? 'Data Source Setup (Test Mode)' : 'Welcome to Tavern Born'}
                    </DialogTitle>
                    <DialogDescription>
                        {isForced
                            ? 'Startup prompt forced for testing. Close this dialog when done.'
                            : 'Before you begin, configure a data source so the app can load 5etools game data (races, classes, spells, items, and more).'}
                    </DialogDescription>
                </DialogHeader>

                <DataSourceConfigurator />
            </DialogContent>
        </Dialog>
    )
}
