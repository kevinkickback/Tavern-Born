import { Card } from '@/components/ui/card'
import { useCharacterStore } from '@/store/characterStore'
import { PersonSimple, Sword, Scroll, Certificate, Barbell } from '@phosphor-icons/react'

export function BuildRacePage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <PersonSimple className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to choose their race.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Race selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildClassPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Sword className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to choose their class.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Class selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildBackgroundPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Scroll className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to choose their background.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Background selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildProficienciesPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Certificate className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to manage their proficiencies.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Proficiency management interface
        </p>
      </div>
    </div>
  )
}

export function BuildAbilityScoresPage() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  if (!activeCharacter) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="p-8 text-center max-w-md">
          <Barbell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" weight="duotone" />
          <h2 className="font-display text-2xl font-bold mb-2">No Character Selected</h2>
          <p className="text-muted-foreground">
            Please select or create a character to assign their ability scores.
          </p>
        </Card>
      </div>
    )
  }
  return (
    <div>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Ability score assignment interface
        </p>
      </div>
    </div>
  )
}
