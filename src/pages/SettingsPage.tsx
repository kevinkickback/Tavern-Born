import { Database, Gear, Info, Palette, Sliders } from '@phosphor-icons/react'
import { useState } from 'react'
import { AboutPanel } from '@/components/settings/AboutPanel'
import { AppearancePanel } from '@/components/settings/AppearancePanel'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { GeneralPanel } from '@/components/settings/GeneralPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'general', label: 'General', Icon: Sliders },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'data', label: 'Game Data', Icon: Database },
  { id: 'about', label: 'About', Icon: Info },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general')

  return (
    <div>
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Gear className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure app preferences and game data sources
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full">
        {/* Tab navigation */}
        <div className="border-b border-border mb-6 px-1">
          <nav className="flex gap-1">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  activeTab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-4 w-4" weight="duotone" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'appearance' && <AppearancePanel />}
        {activeTab === 'data' && <DataSourceConfigurator />}
        {activeTab === 'general' && <GeneralPanel />}
        {activeTab === 'about' && <AboutPanel />}
      </div>
    </div>
  )
}
