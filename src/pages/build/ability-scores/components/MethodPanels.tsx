import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  formatModifier,
  isValidStandardArrayAssignment,
} from '@/lib/calculations/abilityScores';
import {
  getAbilityModifier,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from '@/lib/calculations/gameRules';
import { cn } from '@/lib/utils';
import { DEFAULT_STANDARD_ARRAY_ASSIGNMENT } from '@/pages/build/ability-scores/model/data';

interface SharedPanelProps {
  scores: Record<AbilityName, number>;
  racialBonuses: Partial<Record<AbilityName, number>>;
  selectedAbility: AbilityName;
  onSelectAbility: (ability: AbilityName) => void;
}

interface PointBuyPanelProps extends SharedPanelProps {
  pointBuyTotal: number;
  pointBuyRemaining: number;
  setScore: (ability: AbilityName, score: number) => void;
}

export function BuildAbilityScoresPointBuyPanel({
  scores,
  racialBonuses,
  pointBuyTotal,
  pointBuyRemaining,
  setScore,
  selectedAbility,
  onSelectAbility,
}: PointBuyPanelProps) {
  const budgetPct = Math.min(100, (pointBuyTotal / POINT_BUY_BUDGET) * 100);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
        <div className="flex justify-between text-sm font-semibold mb-2">
          <span>Points Used</span>
          <span
            className={cn(
              pointBuyRemaining < 0 && 'text-destructive font-bold',
            )}
          >
            {pointBuyTotal} / {POINT_BUY_BUDGET}
            <span className="text-muted-foreground font-normal ml-2">
              (
              {pointBuyRemaining >= 0
                ? `${pointBuyRemaining} remaining`
                : `${-pointBuyRemaining} over budget`}
              )
            </span>
          </span>
        </div>
        <Progress value={budgetPct} className="h-2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? 8;
          const racial = racialBonuses[ability] ?? 0;
          const total = score + racial;
          const modifier = formatModifier(getAbilityModifier(total));
          const cost = POINT_BUY_COSTS[score] ?? 0;
          const nextCost = POINT_BUY_COSTS[score + 1] ?? 999;
          const canDecrease = score > POINT_BUY_MIN;
          const canIncrease =
            score < POINT_BUY_MAX && pointBuyRemaining >= nextCost - cost;

          return (
            <div
              key={ability}
              className={cn(
                'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 rounded-lg border transition-colors',
                selectedAbility === ability
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/60',
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onSelectAbility(ability)}
              >
                <div className="text-sm font-bold text-accent uppercase tracking-wider">
                  {ABILITY_ABBREVIATIONS[ability]}
                </div>
                {racial !== 0 && (
                  <div className="text-sm font-semibold text-emerald-500">
                    {racial > 0 ? '+' : ''}
                    {racial}
                  </div>
                )}
              </button>
              <button
                type="button"
                className="w-full text-center mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onSelectAbility(ability)}
              >
                <div className="text-3xl font-bold font-mono leading-none">
                  {total}
                </div>
                <div className="text-xl font-semibold mt-1">{modifier}</div>
              </button>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-8 w-8 p-0 text-base font-bold',
                    canDecrease
                      ? 'border-accent/45 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60'
                      : 'opacity-35 cursor-not-allowed',
                  )}
                  onClick={() =>
                    setScore(ability, Math.max(POINT_BUY_MIN, score - 1))
                  }
                  disabled={!canDecrease}
                >
                  -
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-8 w-8 p-0 text-base font-bold',
                    canIncrease
                      ? 'border-accent/45 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60'
                      : 'opacity-35 cursor-not-allowed',
                  )}
                  onClick={() =>
                    setScore(ability, Math.min(POINT_BUY_MAX, score + 1))
                  }
                  disabled={!canIncrease}
                >
                  +
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StandardArrayPanelProps extends SharedPanelProps {
  setAllScores: (next: Partial<Record<AbilityName, number>>) => void;
}

export function BuildAbilityScoresStandardArrayPanel({
  scores,
  racialBonuses,
  setAllScores,
  selectedAbility,
  onSelectAbility,
}: StandardArrayPanelProps) {
  const available = [...STANDARD_ARRAY] as number[];
  const [assignments, setAssignments] = useState<
    Partial<Record<AbilityName, number>>
  >({ ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT });

  useEffect(() => {
    if (isValidStandardArrayAssignment(scores)) {
      const next: Partial<Record<AbilityName, number>> = {};
      for (const ability of ABILITY_NAMES) next[ability] = scores[ability];
      setAssignments(next);
      return;
    }

    // Scores aren't a valid standard array assignment — update local UI state
    // only; do NOT overwrite the character store, as the user may have arrived
    // here from a different method (e.g. custom/point-buy) or the panel just
    // mounted for the first time.
    setAssignments({ ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT });
  }, [scores]);

  const assign = (ability: AbilityName, raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;

    const next = { ...assignments };
    const current = next[ability];
    const otherAbility = ABILITY_NAMES.find(
      (ab) => ab !== ability && next[ab] === value,
    );

    if (otherAbility) {
      next[otherAbility] = current ?? available[0] ?? 8;
    }

    next[ability] = value;
    setAssignments(next);

    const update: Partial<Record<AbilityName, number>> = {};
    for (const ab of ABILITY_NAMES) {
      if (next[ab] !== undefined) update[ab] = next[ab] as number;
    }
    setAllScores(update);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {ABILITY_NAMES.map((ability) => {
          const racial = racialBonuses[ability] ?? 0;
          const base = assignments[ability];
          const total = base !== undefined ? base + racial : undefined;
          const modifier =
            total !== undefined
              ? formatModifier(getAbilityModifier(total))
              : '—';

          return (
            <div
              key={ability}
              className={cn(
                'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 rounded-lg border transition-colors',
                selectedAbility === ability
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/60',
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onSelectAbility(ability)}
              >
                <div className="text-sm font-bold text-accent uppercase tracking-wider">
                  {ABILITY_ABBREVIATIONS[ability]}
                </div>
                {racial !== 0 && (
                  <div className="text-sm font-semibold text-emerald-500">
                    {racial > 0 ? '+' : ''}
                    {racial}
                  </div>
                )}
              </button>
              <button
                type="button"
                className="w-full text-center mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onSelectAbility(ability)}
              >
                <div className="text-3xl font-bold font-mono leading-none">
                  {total ?? '—'}
                </div>
                <div className="text-xl font-semibold mt-1">{modifier}</div>
              </button>
              <div className="flex justify-center">
                <Select
                  value={base !== undefined ? String(base) : ''}
                  onValueChange={(value) => assign(ability, value)}
                >
                  <SelectTrigger className="h-9 w-[84px] px-2 text-sm [&_span]:truncate">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent className="w-[84px] min-w-[84px]">
                    {available.map((value) => (
                      <SelectItem
                        key={value}
                        value={String(value)}
                        className="pr-6"
                      >
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CustomScoresPanelProps extends SharedPanelProps {
  setScore: (ability: AbilityName, score: number) => void;
}

export function BuildAbilityScoresCustomScoresPanel({
  scores,
  racialBonuses,
  setScore,
  selectedAbility,
  onSelectAbility,
}: CustomScoresPanelProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {ABILITY_NAMES.map((ability) => {
        const value = scores[ability] ?? 10;
        const racial = racialBonuses[ability] ?? 0;
        const total = value + racial;
        const modifier = formatModifier(getAbilityModifier(total));

        return (
          <div
            key={ability}
            className={cn(
              'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 rounded-lg border transition-colors',
              selectedAbility === ability
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-accent/60',
            )}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onSelectAbility(ability)}
            >
              <div className="text-sm font-bold text-accent uppercase tracking-wider">
                {ABILITY_ABBREVIATIONS[ability]}
              </div>
              {racial !== 0 && (
                <div className="text-sm font-semibold text-emerald-500">
                  {racial > 0 ? '+' : ''}
                  {racial}
                </div>
              )}
            </button>
            <button
              type="button"
              className="w-full text-center mb-2 bg-transparent border-0 p-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onSelectAbility(ability)}
            >
              <div className="text-3xl font-bold font-mono leading-none">
                {total}
              </div>
              <div className="text-xl font-semibold mt-1">{modifier}</div>
            </button>
            <div className="flex items-center justify-center gap-3">
              <Input
                type="number"
                min={1}
                max={30}
                value={value}
                className="h-10 w-24 text-center font-mono font-bold text-base"
                onChange={(event) => {
                  const next = Math.min(
                    30,
                    Math.max(1, Number(event.target.value) || 1),
                  );
                  setScore(ability, next);
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
