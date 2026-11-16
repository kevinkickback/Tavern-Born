import { WarningCircle } from '@phosphor-icons/react'
import { type ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isSettingsPath } from '@/lib/navigation/settingsNavigation'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { AppStatusBar } from './AppStatusBar'
import { AppTitleBar } from './AppTitleBar'
import { CharacterLibrarySidebarContext } from './characterLibrarySidebar'

export const APP_INTERACTIVE_CONTENT_ID = 'app-interactive-content'

interface AppLayoutProps {
  children: ReactNode
  onOpenAppUpdate?: () => void
}

export function AppLayout({ children, onOpenAppUpdate }: AppLayoutProps) {
  const [librarySidebar, setLibrarySidebar] = useState<HTMLDivElement | null>(null)
  const secondarySidebarOpen = useAppPreferencesStore((state) => state.secondarySidebarOpen)
  const usingBuiltInRules = useGameDataStore((state) => state.sessionBundledSource !== null)
  const { pathname } = useLocation()

  return (
    <div
      id={APP_INTERACTIVE_CONTENT_ID}
      className={cn(
        'grid h-screen grid-rows-[2rem_minmax(0,1fr)_2.25rem] overflow-hidden bg-app-shell transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
        secondarySidebarOpen
          ? 'grid-cols-[4rem_14rem_minmax(0,1fr)]'
          : 'grid-cols-[4rem_0.75rem_minmax(0,1fr)]',
      )}
    >
      <AppTitleBar />
      <AppSidebar libraryControlsRef={setLibrarySidebar} />
      <div className="col-start-3 row-start-2 mt-3 mr-3 flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-workspace-canvas">
        <AppHeader />
        {usingBuiltInRules && pathname !== '/' && !isSettingsPath(pathname) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm">
            <div role="status" className="flex items-start gap-2">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p>
                <strong>Using built-in rules.</strong> Some character options may be unavailable.
              </p>
            </div>
            <Link
              to="/settings?section=data#game-data-update"
              className="font-medium underline underline-offset-2"
            >
              Open Game Data
            </Link>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-auto bg-workspace-canvas">
          <CharacterLibrarySidebarContext.Provider value={librarySidebar}>
            {children}
          </CharacterLibrarySidebarContext.Provider>
        </main>
      </div>
      <AppStatusBar onOpenAppUpdate={onOpenAppUpdate} />
    </div>
  )
}
