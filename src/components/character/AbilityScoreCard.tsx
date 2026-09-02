import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  formatModifier,
} from '@/lib/calculations/abilityScores'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'

interface AbilityScoreCardProps {
  ability: AbilityName
  score: number
  bonus?: number
  children?: React.ReactNode
  interactive?: boolean
  selected?: boolean
  onSelect?: () => void
  variant?: 'card' | 'console'
}

export function AbilityScoreCard({
  ability,
  score,
  bonus = 0,
  children,
  interactive = false,
  selected = false,
  onSelect,
  variant = 'card',
}: AbilityScoreCardProps) {
  const total = score + bonus
  const mod = getAbilityModifier(total)

  if (variant === 'console') {
    const consoleScore = (
      <>
        <div className="font-mono text-5xl font-bold leading-none tabular-nums">{total}</div>
        <div
          className={cn(
            'mt-2.5 min-w-14 rounded-full border-2 bg-background px-2.5 py-1 font-mono text-base font-bold leading-none tabular-nums',
            mod >= 0 ? 'border-success/70 text-success' : 'border-destructive/70 text-destructive',
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
            : interactive
              ? 'border-border-strong hover:border-primary/60'
              : 'border-border-strong',
        )}
      >
        <div
          className={cn(
            'flex h-9 shrink-0 items-center justify-center border-b px-3',
            selected ? 'border-primary/50 bg-primary/15' : 'border-border bg-muted/30',
          )}
        >
          <span className="truncate text-xs font-bold uppercase tracking-[0.13em]">{ability}</span>
        </div>

        {interactive ? (
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

  const scoreBody = (
    <div className="flex-1 flex flex-col items-center justify-center py-3 px-3">
      <div className="text-4xl font-bold font-mono leading-none tabular-nums">{total}</div>
      <div
        className={cn(
          'text-base font-bold mt-2 tabular-nums',
          mod >= 0 ? 'text-emerald-500' : 'text-destructive',
        )}
      >
        {formatModifier(mod)}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        'flex flex-col border rounded-xl overflow-hidden bg-card transition-all duration-200',
        selected
          ? 'border-accent ring-1 ring-accent/20 shadow-md shadow-accent/10'
          : interactive
            ? 'border-border hover:border-accent/40 hover:shadow-sm'
            : 'border-border',
      )}
    >
      <div
        className={cn(
          'h-8 flex items-center px-3 border-b transition-colors',
          selected
            ? 'bg-gradient-to-r from-accent/70 via-accent/30 to-transparent border-accent/30'
            : 'bg-gradient-to-r from-accent/35 via-accent/15 to-transparent border-border/40',
        )}
      >
        <span className="text-xs font-black tracking-widest uppercase text-foreground/90">
          {ABILITY_ABBREVIATIONS[ability]}
        </span>
        {bonus !== 0 && (
          <span
            className={cn(
              'ml-auto text-[11px] font-bold rounded px-1.5 py-0.5 leading-none',
              bonus > 0
                ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/25'
                : 'text-destructive bg-destructive/10 border border-destructive/20',
            )}
          >
            {bonus > 0 ? '+' : ''}
            {bonus}
          </span>
        )}
      </div>

      {interactive ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex flex-col items-center justify-center py-3 px-3 bg-transparent border-0 w-full hover:bg-accent/5 transition-colors cursor-pointer"
        >
          <div className="text-4xl font-bold font-mono leading-none tabular-nums">{total}</div>
          <div
            className={cn(
              'text-base font-bold mt-2 tabular-nums',
              mod >= 0 ? 'text-emerald-500' : 'text-destructive',
            )}
          >
            {formatModifier(mod)}
          </div>
        </button>
      ) : (
        scoreBody
      )}

      {children && <div className="px-3 pb-3 pt-2 border-t border-border/40">{children}</div>}
    </div>
  )
}
