export function FeatsPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Feats</h1>
      <p className="text-muted-foreground mb-8">
        Select feats to customize your character's abilities
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Feat selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function SpellsPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Spells</h1>
      <p className="text-muted-foreground mb-8">
        Manage your character's spell list and prepared spells
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Spell management interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function EquipmentPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Equipment</h1>
      <p className="text-muted-foreground mb-8">
        Manage your character's weapons, armor, and adventuring gear
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Equipment management interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function DetailsPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Character Details</h1>
      <p className="text-muted-foreground mb-8">
        Add personality, appearance, and backstory details
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Character details editing interface
        </p>
      </div>
    </div>
  )
}

export function CharacterSheetPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Character Sheet</h1>
      <p className="text-muted-foreground mb-8">
        View and print your completed character sheet
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Character sheet display and export interface
        </p>
      </div>
    </div>
  )
}

import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'

export function SettingsPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Settings</h1>
      <p className="text-muted-foreground mb-8">
        Configure data sources and application preferences
      </p>
      <DataSourceConfigurator />
    </div>
  )
}
