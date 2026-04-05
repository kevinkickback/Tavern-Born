import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGameDataStore } from '@/store/gameDataStore';
import { DataSourceConfigurator } from './DataSourceConfigurator';

const FORCE_KEY = 'tb:force-setup';

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
  const hasHydrated = useGameDataStore((s) => s.hasHydrated);
  const gameData = useGameDataStore((s) => s.gameData);
  const isLoading = useGameDataStore((s) => s.isLoading);

  const [isForced] = useState(() => Boolean(localStorage.getItem(FORCE_KEY)));
  const [open, setOpen] = useState(false);

  // Only evaluate visibility once the IDB hydration pass is complete.
  // This prevents the modal from flashing on launch before cached config is read.
  useEffect(() => {
    if (!hasHydrated) return;
    const needsSetup = !gameData && !isLoading;
    setOpen(isForced || needsSetup);
  }, [hasHydrated, gameData, isLoading, isForced]);

  const handleOpenChange = (next: boolean) => {
    if (!next && !gameData && !isLoading && !isForced) {
      // Block closing when there is genuinely no data available.
      return;
    }
    if (!next && isForced) {
      localStorage.removeItem(FORCE_KEY);
    }
    setOpen(next);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!gameData && !isLoading && !isForced) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isForced ? 'Data Source Setup' : 'Welcome to Tavern Born'}
          </DialogTitle>
          <DialogDescription>
            {isForced
              ? 'Reconfigure your data source. Close when done.'
              : 'Configure a data source so the app can load 5etools game data (races, classes, spells, items, and more).'}
          </DialogDescription>
        </DialogHeader>

        <DataSourceConfigurator />
      </DialogContent>
    </Dialog>
  );
}
