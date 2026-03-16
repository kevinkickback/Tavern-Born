import { Alert, AlertDescription } from '@/components/ui/alert'
import { Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { CharacterWizardData } from '../types'
import { ABILITY_NAMES, ABILITY_ABBREVIATIONS, formatModifier } from '@/lib/abilityScores'
import { getAbilityModifier } from '@/lib/gameRules'

interface ReviewStepProps {
  data: CharacterWizardData
}

export function ReviewStep({ data }: ReviewStepProps) {
  const missingFields: string[] = []
  if (!data.name) missingFields.push('Character Name')
  if (!data.race) missingFields.push('Race')
  if (!data.class) missingFields.push('Class')
  if (!data.background) missingFields.push('Background')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold mb-2">Review Your Character</h3>
        <p className="text-muted-foreground mb-6">
          Review your choices before creating your character.
        </p>
      </div>

      {missingFields.length > 0 && (
        <Alert variant="destructive">
          <Warning className="h-4 w-4" />
          <AlertDescription>
            Some fields are not set: {missingFields.join(', ')}. You can still create the character, but you'll need to configure these later.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className={cn(
          "p-4 rounded-lg border",
          !data.name ? "bg-destructive/10 border-destructive/50" : "bg-muted/50 border-border"
        )}>
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
            Character Name
            {!data.name && <Warning className="h-4 w-4 text-destructive" />}
          </div>
          <div className="font-semibold">{data.name || 'Not set'}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="text-sm text-muted-foreground mb-1">Gender</div>
            <div className="font-semibold">{data.gender || 'Not set'}</div>
          </div>
          <div className={cn(
            "p-4 rounded-lg border",
            !data.race ? "bg-destructive/10 border-destructive/50" : "bg-muted/50 border-border"
          )}>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
              Race
              {!data.race && <Warning className="h-4 w-4 text-destructive" />}
            </div>
            <div className="font-semibold">{data.race || 'Not set'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={cn(
            "p-4 rounded-lg border",
            !data.class ? "bg-destructive/10 border-destructive/50" : "bg-muted/50 border-border"
          )}>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
              Class
              {!data.class && <Warning className="h-4 w-4 text-destructive" />}
            </div>
            <div className="font-semibold">{data.class || 'Not set'}</div>
          </div>
          <div className={cn(
            "p-4 rounded-lg border",
            !data.background ? "bg-destructive/10 border-destructive/50" : "bg-muted/50 border-border"
          )}>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
              Background
              {!data.background && <Warning className="h-4 w-4 text-destructive" />}
            </div>
            <div className="font-semibold">{data.background || 'Not set'}</div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Ability Scores</div>
          <div className="text-xs text-muted-foreground mb-3 capitalize">
            Method: {data.abilityScoreMethod?.replace(/-/g, ' ') || 'Standard Array'}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {ABILITY_NAMES.map((ability) => {
              const score = (data.abilityScores?.[ability] as number | undefined) ?? 8
              const mod = getAbilityModifier(score)
              return (
                <div key={ability} className="text-center">
                  <div className="text-xs text-muted-foreground uppercase font-semibold mb-0.5">
                    {ABILITY_ABBREVIATIONS[ability]}
                  </div>
                  <div className="text-lg font-bold font-mono">{score}</div>
                  <div className={cn('text-xs font-medium', mod >= 0 ? 'text-green-500' : 'text-destructive')}>
                    {formatModifier(mod)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
