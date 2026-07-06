import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const sidebarOpen = useAppPreferencesStore((s) => s.sidebarOpen)

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      <AppHeader />
      <AppSidebar />
      <main
        className={cn(
          'flex-1 min-h-0 overflow-auto transition-[padding] duration-300 bg-texture',
          sidebarOpen ? 'xl:pl-56' : 'xl:pl-12',
        )}
      >
        {children}
      </main>
    </div>
  )
}
