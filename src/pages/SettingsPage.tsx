import { useLocation } from 'react-router-dom'
import { AboutPanel } from '@/components/settings/AboutPanel'
import { AppearancePanel } from '@/components/settings/AppearancePanel'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'

type SettingsPanel = 'general' | 'appearance' | 'data' | 'about'

function getActivePanel(pathname: string): SettingsPanel {
  const segments = pathname.split('/')
  const panel = segments[segments.length - 1]
  if (panel === 'appearance' || panel === 'data' || panel === 'about') return panel
  return 'general'
}

export function SettingsPage() {
  const location = useLocation()
  const activePanel = getActivePanel(location.pathname)

  return (
    <WorkspacePage>
      <WorkspaceBody>
        <div className="mx-auto w-full max-w-4xl px-6 py-5">
          {activePanel === 'general' && <GeneralPanel />}
          {activePanel === 'appearance' && <AppearancePanel />}
          {activePanel === 'data' && <DataSourceConfigurator />}
          {activePanel === 'about' && <AboutPanel />}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
