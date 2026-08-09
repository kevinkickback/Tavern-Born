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
    <div className="h-screen bg-background overflow-hidden">
      <AppSidebar />
      <div
        className={cn(
          'h-screen flex flex-col transition-[padding] duration-300',
          sidebarOpen ? 'xl:pl-60' : 'xl:pl-16',
        )}
      >
        <AppHeader />
        <main className="flex-1 min-h-0 overflow-auto bg-texture">{children}</main>
      </div>
    </div>
  )
}
