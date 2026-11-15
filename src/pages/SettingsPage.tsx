import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { AboutPanel } from '@/components/settings/AboutPanel'
import { AppearancePanel } from '@/components/settings/AppearancePanel'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { getSettingsSection } from '@/lib/navigation/settingsNavigation'

export function SettingsPage() {
  const location = useLocation()
  const activePanel = getSettingsSection(location.search)

  useEffect(() => {
    if (location.hash === '#game-data-update') {
      document.getElementById('game-data-update')?.focus()
    }
  }, [location])

  return (
    <WorkspacePage>
      <WorkspaceBody key={activePanel.id} role="region" aria-label={activePanel.label}>
        <div className="mx-auto w-full max-w-4xl px-6 py-5">
          {activePanel.id === 'general' && <GeneralPanel />}
          {activePanel.id === 'appearance' && <AppearancePanel />}
          {activePanel.id === 'data' && <DataSourceConfigurator />}
          {activePanel.id === 'about' && <AboutPanel />}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
