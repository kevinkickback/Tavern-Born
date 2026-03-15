import { Card } from '@/components/ui/card'
import { useCharacterStore } from '@/store/characterStore'
import { Star, MagicWand, Backpack } from '@phosphor-icons/react'

export function FeatsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to choose their feats.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Feat selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function SpellsPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <MagicWand className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their spell list.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Spell management interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function EquipmentPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Backpack className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their equipment.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
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
    <div className="max-w-7xl mx-auto w-full">
      <DataSourceConfigurator />
    </div>
  )
}
