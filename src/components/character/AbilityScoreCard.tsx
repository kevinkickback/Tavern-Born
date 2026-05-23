import type { AbilityName } from '@/lib/calculations/abilityScores'
import { ABILITY_ABBREVIATIONS, formatModifier } from '@/lib/calculations/abilityScores'
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
}

export function AbilityScoreCard({
  ability,
  score,
  bonus = 0,
  children,
  interactive = false,
  selected = false,
  onSelect,
}: AbilityScoreCardProps) {
  const total = score + bonus
  const mod = getAbilityModifier(total)

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
