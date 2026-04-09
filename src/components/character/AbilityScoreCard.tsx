import type { AbilityName } from '@/lib/calculations/abilityScores';
import {
  ABILITY_ABBREVIATIONS,
  formatModifier,
} from '@/lib/calculations/abilityScores';
import { getAbilityModifier } from '@/lib/calculations/gameRules';
import { cn } from '@/lib/utils';

interface AbilityScoreCardProps {
  ability: AbilityName;
  score: number;
  bonus?: number;
  children?: React.ReactNode;
  interactive?: boolean;
  onSelect?: () => void;
}

/**
 * Reusable ability score card component for displaying a single ability score.
 * Shows the ability abbreviation, total score, bonus (if any) in top right,
 * and the derived modifier. Optionally interactive with click handler.
 */
export function AbilityScoreCard({
  ability,
  score,
  bonus = 0,
  children,
  interactive = false,
  onSelect,
}: AbilityScoreCardProps) {
  const total = score + bonus;
  const mod = getAbilityModifier(total);

  const containerClass = cn(
    'border rounded-lg p-3 bg-card/50 border-border flex flex-col items-center justify-between min-h-0',
    interactive && 'cursor-pointer hover:border-accent/60 transition-colors',
  );

  const cardContent = (
    <>
      <div className="w-full flex items-center justify-between">
        <div className="text-xs font-bold text-accent uppercase tracking-wider">
          {ABILITY_ABBREVIATIONS[ability]}
        </div>
        {bonus !== 0 && (
          <div className="text-sm font-semibold text-emerald-500">
            {bonus > 0 ? '+' : ''}
            {bonus}
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="text-3xl font-bold font-mono leading-none">{total}</div>
        <div
          className={cn(
            'text-base font-semibold mt-0.5',
            mod >= 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {formatModifier(mod)}
        </div>
      </div>

      {children && <div>{children}</div>}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`${containerClass} max-h-[160px]`}
      >
        {cardContent}
      </button>
    );
  }

  return <div className={`${containerClass} max-h-[160px]`}>{cardContent}</div>;
}
