import { StepProps } from '../types'

export function AbilityScoresStep({ data }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold mb-2">Ability Scores</h3>
        <p className="text-muted-foreground mb-6">
          Your ability score generation method has been set to{' '}
          <span className="font-semibold text-foreground capitalize">
            {data.abilityScoreMethod?.replace('-', ' ') || 'Standard Array'}
          </span>
          . You'll configure the specific values in the Build section after character creation.
        </p>
      </div>

      <div className="p-6 rounded-lg bg-muted/50 border border-border">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">STR</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">DEX</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">CON</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">INT</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">WIS</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">CHA</div>
            <div className="text-2xl font-bold font-mono">--</div>
          </div>
        </div>
      </div>

      {data.abilityScoreMethod === 'standard-array' && (
        <div className="p-4 bg-accent/10 rounded-lg border border-accent/30">
          <div className="font-semibold mb-2">Standard Array</div>
          <div className="text-sm text-muted-foreground">
            You'll assign the following scores: <span className="font-mono font-semibold text-foreground">15, 14, 13, 12, 10, 8</span>
          </div>
        </div>
      )}

      {data.abilityScoreMethod === 'point-buy' && (
        <div className="p-4 bg-accent/10 rounded-lg border border-accent/30">
          <div className="font-semibold mb-2">Point Buy</div>
          <div className="text-sm text-muted-foreground">
            You'll have <span className="font-mono font-semibold text-foreground">27 points</span> to distribute across your ability scores (8-15 range).
          </div>
        </div>
      )}

      {data.abilityScoreMethod === 'custom' && (
        <div className="p-4 bg-accent/10 rounded-lg border border-accent/30">
          <div className="font-semibold mb-2">Custom</div>
          <div className="text-sm text-muted-foreground">
            You'll be able to manually enter any values for your ability scores.
          </div>
        </div>
      )}
    </div>
  )
}
