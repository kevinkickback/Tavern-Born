import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'
import { AppStatusBar } from './AppStatusBar'
import { AppTitleBar } from './AppTitleBar'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="grid h-screen grid-cols-[4rem_14rem_minmax(0,1fr)] grid-rows-[2rem_minmax(0,1fr)_1.5rem] overflow-hidden bg-app-shell">
      <AppTitleBar />
      <AppSidebar />
      <div className="col-start-3 row-start-2 m-3 ml-0 flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-strong bg-workspace-canvas">
        <AppHeader />
        <main className="min-h-0 flex-1 overflow-auto bg-workspace-canvas">{children}</main>
      </div>
      <AppStatusBar />
    </div>
  )
}
