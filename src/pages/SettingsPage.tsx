import { Database, Gear, Info, Palette } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { AboutPanel } from '@/components/settings/AboutPanel'
import { AppearancePanel } from '@/components/settings/AppearancePanel'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { cn } from '@/lib/utils'

type SettingsPanel = 'general' | 'appearance' | 'data' | 'about'

const SETTINGS_SECTIONS = [
  { value: 'general', label: 'General', icon: Gear },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'data', label: 'Game Data', icon: Database },
  { value: 'about', label: 'About', icon: Info },
] as const

function getActivePanel(panel: string | null): SettingsPanel {
  if (panel === 'appearance' || panel === 'data' || panel === 'about') return panel
  return 'general'
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activePanel = getActivePanel(searchParams.get('section'))

  const setActivePanel = (panel: SettingsPanel) => {
    setSearchParams(panel === 'general' ? {} : { section: panel }, { replace: true })
  }

  return (
    <WorkspacePage>
      <WorkspacePaneHeader ariaLabel="Settings category">
        <div className="h-full min-w-0 flex-1 overflow-x-auto">
          <div
            className="inline-flex h-full min-w-max items-stretch gap-5"
            role="tablist"
            aria-label="Settings category"
          >
            {SETTINGS_SECTIONS.map(({ value, label, icon: Icon }) => {
              const active = activePanel === value
              return (
                <button
                  key={value}
                  id={`settings-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`settings-panel-${value}`}
                  onClick={() => setActivePanel(value)}
                  className={cn(
                    'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn('size-4 shrink-0', active && 'text-primary')}
                    weight={active ? 'fill' : 'regular'}
                  />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </WorkspacePaneHeader>
      <WorkspaceBody>
        <div
          id={`settings-panel-${activePanel}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activePanel}`}
          className="mx-auto w-full max-w-4xl px-6 py-5"
        >
          {activePanel === 'general' && <GeneralPanel />}
          {activePanel === 'appearance' && <AppearancePanel />}
          {activePanel === 'data' && <DataSourceConfigurator />}
          {activePanel === 'about' && <AboutPanel />}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
