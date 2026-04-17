import { Barbell } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { AbilityScoreCard } from '@/components/character/AbilityScoreCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ABILITY_NAMES,
  type AbilityName,
  isValidStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import { DEFAULT_STANDARD_ARRAY_ASSIGNMENT } from '@/pages/build/ability-scores/model/data'

interface SharedPanelProps {
  scores: Record<AbilityName, number>
  racialBonuses: Partial<Record<AbilityName, number>>
  selectedAbility: AbilityName
  onSelectAbility: (ability: AbilityName) => void
}

interface PointBuyPanelProps extends SharedPanelProps {
  pointBuyTotal: number
  pointBuyRemaining: number
  setScore: (ability: AbilityName, score: number) => void
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
  const budgetPct = Math.min(100, (pointBuyTotal / POINT_BUY_BUDGET) * 100)

  return (
    <div className="flex flex-col gap-5">
      {/* Points Used — dashboard stat card style */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="h-9 bg-gradient-to-r from-accent/60 via-accent/30 to-transparent border-b border-border/40 flex items-center px-3 gap-2">
          <Barbell className="h-4 w-4 text-accent/80" weight="bold" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Points Used
          </span>
          <span
            className={cn(
              'ml-auto text-sm font-bold font-mono',
              pointBuyRemaining < 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {pointBuyTotal} / {POINT_BUY_BUDGET}
          </span>
        </div>
        <div className="px-4 pt-3 pb-3">
          <Progress value={budgetPct} className="h-1.5" />
          <p
            className={cn(
              'text-xs mt-1.5 text-right',
              pointBuyRemaining < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground',
            )}
          >
            {pointBuyRemaining >= 0
              ? `${pointBuyRemaining} remaining`
              : `${Math.abs(pointBuyRemaining)} over budget`}
          </p>
        </div>
      </div>

      {/* Ability score cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? POINT_BUY_MIN
          const racial = racialBonuses[ability] ?? 0
          const cost = POINT_BUY_COSTS[score] ?? 0
          const nextCost = POINT_BUY_COSTS[score + 1] ?? 999
          const canDecrease = score > POINT_BUY_MIN
          const canIncrease = score < POINT_BUY_MAX && pointBuyRemaining >= nextCost - cost

          return (
            <AbilityScoreCard
              key={ability}
              ability={ability}
              score={score}
              bonus={racial}
              interactive
              selected={selectedAbility === ability}
              onSelect={() => onSelectAbility(ability)}
            >
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 text-base font-bold border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 hover:border-accent/50',
                    !canDecrease && 'opacity-30 cursor-not-allowed',
                  )}
                  onClick={() => setScore(ability, Math.max(POINT_BUY_MIN, score - 1))}
                  disabled={!canDecrease}
                >
                  −
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-7 w-7 shrink-0 text-base font-bold border-accent/30 bg-accent/5 text-accent hover:bg-accent/15 hover:border-accent/50',
                    !canIncrease && 'opacity-30 cursor-not-allowed',
                  )}
                  onClick={() => setScore(ability, Math.min(POINT_BUY_MAX, score + 1))}
                  disabled={!canIncrease}
                >
                  +
                </Button>
              </div>
            </AbilityScoreCard>
          )
        })}
      </div>
    </div>
  )
}

interface StandardArrayPanelProps extends SharedPanelProps {
  setAllScores: (next: Partial<Record<AbilityName, number>>) => void
}

export function BuildAbilityScoresStandardArrayPanel({
  scores,
  racialBonuses,
  setAllScores,
  selectedAbility,
  onSelectAbility,
}: StandardArrayPanelProps) {
  const available = [...STANDARD_ARRAY] as number[]
  const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>({
    ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT,
  })

  useEffect(() => {
    if (isValidStandardArrayAssignment(scores)) {
      const next: Partial<Record<AbilityName, number>> = {}
      for (const ability of ABILITY_NAMES) next[ability] = scores[ability]
      setAssignments(next)
      return
    }

    // Scores aren't a valid standard array assignment — update local UI state
    // only; do NOT overwrite the character store, as the user may have arrived
    // here from a different method (e.g. custom/point-buy) or the panel just
    // mounted for the first time.
    setAssignments({ ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT })
  }, [scores])

  const assign = (ability: AbilityName, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return

    const next = { ...assignments }
    const current = next[ability]
    const otherAbility = ABILITY_NAMES.find((ab) => ab !== ability && next[ab] === value)

    if (otherAbility) {
      next[otherAbility] = current ?? available[0] ?? 8
    }

    next[ability] = value
    setAssignments(next)

    const update: Partial<Record<AbilityName, number>> = {}
    for (const ab of ABILITY_NAMES) {
      if (next[ab] !== undefined) update[ab] = next[ab] as number
    }
    setAllScores(update)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ABILITY_NAMES.map((ability) => {
        const racial = racialBonuses[ability] ?? 0
        const base = assignments[ability]

        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={base ?? 8}
            bonus={racial}
            interactive
            selected={selectedAbility === ability}
            onSelect={() => onSelectAbility(ability)}
          >
            <div className="flex justify-center">
              <Select
                value={base !== undefined ? String(base) : ''}
                onValueChange={(value) => assign(ability, value)}
              >
                <SelectTrigger className="h-8 w-[84px] px-2 text-sm [&_span]:truncate">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent className="w-[84px] min-w-[84px]">
                  {available.map((value) => (
                    <SelectItem key={value} value={String(value)} className="pr-6">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </AbilityScoreCard>
        )
      })}
    </div>
  )
}

interface CustomScoresPanelProps extends SharedPanelProps {
  setScore: (ability: AbilityName, score: number) => void
}

export function BuildAbilityScoresCustomScoresPanel({
  scores,
  racialBonuses,
  setScore,
  selectedAbility,
  onSelectAbility,
}: CustomScoresPanelProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ABILITY_NAMES.map((ability) => {
        const value = scores[ability] ?? 10
        const racial = racialBonuses[ability] ?? 0

        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={value}
            bonus={racial}
            interactive
            selected={selectedAbility === ability}
            onSelect={() => onSelectAbility(ability)}
          >
            <div className="flex items-center justify-center">
              <Input
                type="number"
                min={1}
                max={30}
                value={value}
                className="h-8 w-20 text-center font-mono font-bold text-sm"
                onChange={(event) => {
                  const next = Math.min(30, Math.max(1, Number(event.target.value) || 1))
                  setScore(ability, next)
                }}
              />
            </div>
          </AbilityScoreCard>
        )
      })}
    </div>
  )
}
