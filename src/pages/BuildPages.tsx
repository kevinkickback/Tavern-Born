export function BuildRacePage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Select Race</h1>
      <p className="text-muted-foreground mb-8">
        Choose your character's race to determine racial traits and bonuses
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Race selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildClassPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Select Class</h1>
      <p className="text-muted-foreground mb-8">
        Choose your character's class to determine abilities and features
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Class selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildBackgroundPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Select Background</h1>
      <p className="text-muted-foreground mb-8">
        Choose your character's background for skills and proficiencies
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Background selection interface - connects to 5etools data
        </p>
      </div>
    </div>
  )
}

export function BuildProficienciesPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Proficiencies</h1>
      <p className="text-muted-foreground mb-8">
        Manage armor, weapon, tool, and language proficiencies
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Proficiency management interface
        </p>
      </div>
    </div>
  )
}

export function BuildAbilityScoresPage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-bold mb-4">Ability Scores</h1>
      <p className="text-muted-foreground mb-8">
        Assign your character's ability scores using point buy, standard array, or manual entry
      </p>
      <div className="text-center py-20 bg-card rounded-lg border border-border">
        <p className="text-lg text-muted-foreground">
          Ability score assignment interface
        </p>
      </div>
    </div>
  )
}
