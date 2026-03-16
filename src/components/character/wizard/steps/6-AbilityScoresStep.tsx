import { StepProps } from '../types'
import {
  ABILITY_NAMES,
  ABILITY_ABBREVIATIONS,
  formatModifier,
} from '@/lib/abilityScores'
import {
  STANDARD_ARRAY,
  POINT_BUY_COSTS,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  getAbilityModifier,
  getRemainingPointBuy,
} from '@/lib/gameRules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown } from '@phosphor-icons/react'

const DEFAULT_SCORES: Record<string, number> = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
}

interface PanelProps {
  scores: Record<string, number>
  setScore: (ability: string, value: number) => void
}

function StandardArrayPanel({ scores, setScore }: PanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center mr-1">Available:</span>
        {STANDARD_ARRAY.map((v) => {
          const usedCount = Object.values(scores).filter((s) => s === v).length
          return (
            <Badge
              key={v}
              variant={usedCount > 0 ? 'default' : 'outline'}
              className="font-mono text-sm px-2 py-0.5"
            >
              {v}
            </Badge>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ABILITY_NAMES.map((ability) => {
          const currentScore = scores[ability] ?? 8
          const availableValues = STANDARD_ARRAY.filter(
            (v) =>
              v === currentScore ||
              !ABILITY_NAMES.some((a) => a !== ability && scores[a] === v)
          )
          return (
            <div key={ability} className="flex items-center gap-3">
              <div className="w-28 text-sm font-medium capitalize">{ability}</div>
              <Select
                value={String(currentScore)}
                onValueChange={(val) => setScore(ability, Number(val))}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableValues.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PointBuyPanel({ scores, setScore }: PanelProps) {
  const remaining = getRemainingPointBuy(scores)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
        <span className="text-sm font-medium">Points Remaining</span>
        <Badge
          variant={remaining < 0 ? 'destructive' : 'outline'}
          className="font-mono text-base px-3"
        >
          {remaining} / {POINT_BUY_BUDGET}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? POINT_BUY_MIN
          const costNow = POINT_BUY_COSTS[score] ?? 0
          const costNext = POINT_BUY_COSTS[score + 1] ?? Infinity
          const canIncrease = score < POINT_BUY_MAX && remaining >= costNext - costNow
          const canDecrease = score > POINT_BUY_MIN
          return (
            <div key={ability} className="flex items-center gap-2">
              <div className="w-28 text-sm font-medium capitalize">{ability}</div>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!canDecrease}
                onClick={() => setScore(ability, score - 1)}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <div className="w-10 text-center font-mono font-bold">{score}</div>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={!canIncrease}
                onClick={() => setScore(ability, score + 1)}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <div className="text-xs text-muted-foreground w-14 text-right">
                {costNow} pts
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CustomPanel({ scores, setScore }: PanelProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ABILITY_NAMES.map((ability) => (
        <div key={ability} className="flex items-center gap-3">
          <div className="w-28 text-sm font-medium capitalize">{ability}</div>
          <Input
            type="number"
            min={1}
            max={30}
            value={scores[ability] ?? 8}
            onChange={(e) =>
              setScore(
                ability,
                Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1))
              )
            }
            className="w-24 font-mono"
          />
        </div>
      ))}
    </div>
  )
}

export function AbilityScoresStep({ data, onChange }: StepProps) {
  const scores = (data.abilityScores ?? DEFAULT_SCORES) as Record<string, number>
  const method = data.abilityScoreMethod || 'standard-array'

  const setScore = (ability: string, value: number) => {
    onChange({ abilityScores: { ...scores, [ability]: value } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl font-semibold mb-2">Ability Scores</h3>
        <p className="text-muted-foreground">
          Assign your ability scores using{' '}
          <span className="font-semibold text-foreground capitalize">
            {method.replace(/-/g, ' ')}
          </span>
          .
        </p>
      </div>

      {method === 'standard-array' && (
        <StandardArrayPanel scores={scores} setScore={setScore} />
      )}
      {method === 'point-buy' && (
        <PointBuyPanel scores={scores} setScore={setScore} />
      )}
      {method === 'custom' && (
        <CustomPanel scores={scores} setScore={setScore} />
      )}

      <div className="grid grid-cols-6 gap-2">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? 8
          const mod = getAbilityModifier(score)
          return (
            <div
              key={ability}
              className="text-center p-3 rounded-lg bg-muted/50 border border-border"
            >
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                {ABILITY_ABBREVIATIONS[ability]}
              </div>
              <div className="text-xl font-bold font-mono">{score}</div>
              <div
                className={cn(
                  'text-xs font-medium',
                  mod >= 0 ? 'text-green-500' : 'text-destructive'
                )}
              >
                {formatModifier(mod)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
