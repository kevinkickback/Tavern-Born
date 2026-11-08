import { Coins, ListNumbers, PencilSimple } from '@phosphor-icons/react'
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
import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AbilityScoreMethod } from '@/lib/calculations/abilityScoreMethods'
import {
  ABILITY_NAMES,
  type AbilityName,
  isValidStandardArrayAssignment,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  ABILITY_SCORE_MIN,
  calculatePointBuyTotal,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'

const METHODS = [
  { value: 'point-buy', label: 'Point Buy', icon: Coins },
  { value: 'standard-array', label: 'Standard Array', icon: ListNumbers },
  { value: 'custom', label: 'Custom', icon: PencilSimple },
] as const

const DEFAULT_ARRAY = makeDefaultStandardArrayAssignment()

export function AbilityScoreMethodTabs({
  onConfirmStandardArray,
}: {
  onConfirmStandardArray?: () => void
}) {
  return (
    <div className="h-full min-w-0 overflow-x-auto">
      <TabsList
        aria-label="Ability score method"
        className="h-full min-w-max items-stretch gap-5 rounded-none border-0 bg-transparent p-0"
      >
        {METHODS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            onClick={value === 'standard-array' ? onConfirmStandardArray : undefined}
            className="group gap-2 rounded-none border-x-0 border-t-0 border-b-2 px-1 text-xs font-semibold data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Icon className="size-4 group-data-[state=active]:text-primary" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )
}

interface AbilityScoreEditorProps {
  method: AbilityScoreMethod
  scores: Record<AbilityName, number>
  bonuses: Partial<Record<AbilityName, number>>
  setScore: (ability: AbilityName, score: number) => void
  setAllScores: (scores: Record<AbilityName, number>) => void
  selectedAbility?: AbilityName
  onSelectAbility?: (ability: AbilityName) => void
}

export function AbilityScoreEditor({
  method,
  scores,
  bonuses,
  setScore,
  setAllScores,
  selectedAbility,
  onSelectAbility,
}: AbilityScoreEditorProps) {
  const pointsUsed = method === 'point-buy' ? calculatePointBuyTotal(scores) : 0
  const remaining = POINT_BUY_BUDGET - pointsUsed
  const assignments = isValidStandardArrayAssignment(scores) ? scores : DEFAULT_ARRAY

  function assign(ability: AbilityName, value: number) {
    const next = { ...assignments, [ability]: value }
    const swapTarget = ABILITY_NAMES.find(
      (other) => other !== ability && assignments[other] === value,
    )
    if (swapTarget) next[swapTarget] = assignments[ability]
    setAllScores(next)
  }

  const content = (
    <>
      {method === 'point-buy' && (
        <div className="mb-5 ml-auto w-full max-w-80">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span
              className={cn(
                'text-xs font-semibold text-muted-foreground',
                remaining < 0 && 'text-destructive',
              )}
            >
              {remaining} of {POINT_BUY_BUDGET} points remaining
            </span>
            <span className="font-mono text-sm font-bold">
              {pointsUsed} / {POINT_BUY_BUDGET}
            </span>
          </div>
          <Progress
            aria-label="Point buy budget used"
            value={Math.min(100, (pointsUsed / POINT_BUY_BUDGET) * 100)}
            className="h-2"
          />
        </div>
      )}
      <div className="grid grid-cols-2 justify-items-center gap-3 @min-[26rem]:grid-cols-3 @min-[50rem]:grid-cols-6">
        {ABILITY_NAMES.map((ability) => {
          const score = method === 'standard-array' ? assignments[ability] : scores[ability]
          const canIncrease =
            score < POINT_BUY_MAX &&
            remaining >= (POINT_BUY_COSTS[score + 1] ?? 999) - (POINT_BUY_COSTS[score] ?? 0)

          return (
            <AbilityScoreCard
              key={ability}
              ability={ability}
              score={score}
              bonus={bonuses[ability]}
              selected={selectedAbility === ability}
              onSelect={onSelectAbility && (() => onSelectAbility(ability))}
            >
              {method === 'point-buy' && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0 border-accent/30 bg-accent/5 text-base font-bold text-accent hover:border-accent/50 hover:bg-accent/15"
                    aria-label={`Decrease ${ability}`}
                    disabled={score <= POINT_BUY_MIN}
                    onClick={() => setScore(ability, Math.max(POINT_BUY_MIN, score - 1))}
                  >
                    −
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0 border-accent/30 bg-accent/5 text-base font-bold text-accent hover:border-accent/50 hover:bg-accent/15"
                    aria-label={`Increase ${ability}`}
                    disabled={!canIncrease}
                    onClick={() => setScore(ability, Math.min(POINT_BUY_MAX, score + 1))}
                  >
                    +
                  </Button>
                </div>
              )}
              {method === 'standard-array' && (
                <Select
                  value={String(score)}
                  onValueChange={(value) => assign(ability, Number(value))}
                >
                  <SelectTrigger
                    aria-label={`${ability} base score`}
                    className="h-8 w-[84px] px-2 text-sm [&_span]:truncate"
                  >
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent className="w-[84px] min-w-[84px]">
                    {STANDARD_ARRAY.map((value) => (
                      <SelectItem key={value} value={String(value)} className="pr-6">
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {method === 'custom' && (
                <Input
                  aria-label={`${ability} base score`}
                  type="number"
                  min={ABILITY_SCORE_MIN}
                  max={ABILITY_SCORE_ABSOLUTE_MAX}
                  value={score}
                  className="h-8 w-20 text-center font-mono text-sm font-bold"
                  onChange={(event) =>
                    setScore(
                      ability,
                      Math.min(
                        ABILITY_SCORE_ABSOLUTE_MAX,
                        Math.max(
                          ABILITY_SCORE_MIN,
                          Number(event.target.value) || ABILITY_SCORE_MIN,
                        ),
                      ),
                    )
                  }
                />
              )}
            </AbilityScoreCard>
          )
        })}
      </div>
    </>
  )

  return METHODS.map(({ value }) => (
    <TabsContent key={value} value={value} className="@container">
      {value === method && content}
    </TabsContent>
  ))
}
