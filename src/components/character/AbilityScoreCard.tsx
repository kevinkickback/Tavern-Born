import { type AbilityName, formatModifier } from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_ABSOLUTE_MAX, getAbilityModifier } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'

interface AbilityScoreCardProps {
  ability: AbilityName
  score: number
  bonus?: number
  children?: React.ReactNode
  selected?: boolean
  onSelect?: () => void
}

export function AbilityScoreCard({
  ability,
  score,
  bonus = 0,
  children,
  selected = false,
  onSelect,
}: AbilityScoreCardProps) {
  const total = Math.min(score + bonus, ABILITY_SCORE_ABSOLUTE_MAX)
  const mod = getAbilityModifier(total)

  const consoleScore = (
    <>
      <div className="font-mono text-5xl font-bold leading-none tabular-nums">
        <span className="sr-only">Total </span>
        {total}
      </div>
      <div
        className={cn(
          'mt-2.5 min-w-14 rounded-full border-2 bg-background px-2.5 py-1 font-mono text-base font-bold leading-none tabular-nums',
          mod >= 0
            ? 'border-success/70 text-success-foreground'
            : 'border-destructive/70 text-destructive',
        )}
      >
        {formatModifier(mod)}
      </div>
      <div className="mt-2 flex min-h-8 w-full flex-wrap content-center items-center justify-center gap-x-2 gap-y-0 text-center text-[0.6875rem] font-medium leading-tight text-muted-foreground tabular-nums">
        <span className="whitespace-nowrap">Base {score}</span>
        {bonus !== 0 && (
          <span className="whitespace-nowrap">
            Bonus {bonus > 0 ? '+' : ''}
            {bonus}
          </span>
        )}
      </div>
    </>
  )

  return (
    <div
      className={cn(
        'flex h-56 w-full max-w-40 flex-col overflow-hidden rounded-lg border bg-surface-raised/45 transition-colors',
        selected
          ? 'border-primary bg-primary/5'
          : onSelect
            ? 'border-border-strong hover:border-primary/60'
            : 'border-border-strong',
      )}
    >
      <h3
        className={cn(
          'flex h-9 shrink-0 items-center justify-center border-b px-3',
          selected ? 'border-primary/50 bg-primary/15' : 'border-border bg-muted/30',
        )}
      >
        <span className="truncate text-xs font-bold uppercase tracking-[0.13em]">{ability}</span>
      </h3>

      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden bg-transparent px-3 py-3 transition-colors hover:bg-primary/5"
          aria-label={`Show ${ability} details`}
        >
          {consoleScore}
        </button>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-3">
          {consoleScore}
        </div>
      )}

      {children && (
        <div className="flex h-[3.25rem] min-h-[3.25rem] shrink-0 items-center justify-center border-t border-border/70 px-2">
          {children}
        </div>
      )}
    </div>
  )
}
