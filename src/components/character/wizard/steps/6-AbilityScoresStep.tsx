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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  getRaceAbilityData,
  hasFlexibleRaceOriginAsi,
  isValidStandardArrayAssignment,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import {
  ABILITY_SCORE_MIN,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
} from '@/lib/calculations/gameRules'
import {
  normalizeRaceSelectionForOriginSystem,
  usesRaceOriginBenefits,
} from '@/lib/calculations/originSystem'
import { cn } from '@/lib/utils'
import { useGameDataStore } from '@/store/gameDataStore'
import type { StepProps } from '../types'

const DEFAULT_STANDARD_SCORES: Partial<Record<AbilityName, number>> = ABILITY_NAMES.reduce(
  (acc, ab, idx) => {
    acc[ab] = STANDARD_ARRAY[idx] ?? 8
    return acc
  },
  {} as Partial<Record<AbilityName, number>>,
)

const DEFAULT_POINT_BUY_SCORES: Record<AbilityName, number> = {
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
}

const DEFAULT_CUSTOM_SCORES: Record<AbilityName, number> = {
  strength: ABILITY_SCORE_MIN,
  dexterity: ABILITY_SCORE_MIN,
  constitution: ABILITY_SCORE_MIN,
  intelligence: ABILITY_SCORE_MIN,
  wisdom: ABILITY_SCORE_MIN,
  charisma: ABILITY_SCORE_MIN,
}

function RaceAsiBonuses({
  data,
  onChange,
  raceAsiData,
  isLineageRaceAsiFallback,
}: {
  data: StepProps['data']
  onChange: StepProps['onChange']
  raceAsiData: ReturnType<typeof getRaceAbilityData>
  isLineageRaceAsiFallback: boolean
}) {
  const { fixed, choices } = raceAsiData
  if (fixed.length === 0 && choices.length === 0) return null

  const raceAsiChoices: string[][] = data.raceAsiChoices ?? []
  const raceAsiBlockIndex = (data.raceAsiBlockIndex ?? 0) as 0 | 1

  const updateChoice = (blockIdx: number, slotIdx: number, ability: string) => {
    const newChoices = raceAsiChoices.map((arr) => [...arr])
    while (newChoices.length <= blockIdx) newChoices.push([])
    const blockSelections = [...(newChoices[blockIdx] ?? [])]

    // Swap: if another slot in this block already has this ability, give it the current slot's value
    const intraConflict = blockSelections.findIndex((s, si) => si !== slotIdx && s === ability)
    if (intraConflict >= 0) blockSelections[intraConflict] = blockSelections[slotIdx] ?? ''

    // Clear cross-block conflict: same ability cannot appear in any other block
    for (let bi = 0; bi < newChoices.length; bi++) {
      if (bi === blockIdx) continue
      const other = newChoices[bi] ?? []
      for (let si = 0; si < other.length; si++) {
        if (other[si] === ability) other[si] = ''
      }
      newChoices[bi] = other
    }

    blockSelections[slotIdx] = ability
    newChoices[blockIdx] = blockSelections
    onChange({ raceAsiChoices: newChoices })
  }

  return (
    <div className="shrink-0 mt-3 p-3 rounded-lg bg-muted/20 border border-border flex flex-col items-center gap-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Racial Bonuses
      </div>
      {isLineageRaceAsiFallback && (
        <Tabs
          value={String(raceAsiBlockIndex)}
          onValueChange={(value) => {
            const nextIndex = (Number(value) === 1 ? 1 : 0) as 0 | 1
            onChange({
              raceAsiBlockIndex: nextIndex,
              raceAsiChoices: [],
            })
          }}
        >
          <TabsList className="h-9 w-full max-w-xs">
            <TabsTrigger value="0" className="text-xs px-3">
              +2/+1 (2 abilities)
            </TabsTrigger>
            <TabsTrigger value="1" className="text-xs px-3">
              +1/+1/+1 (3 abilities)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {fixed.map((fb) => (
          <span
            key={`${fb.ability}|${fb.value}`}
            className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 font-semibold"
          >
            {ABILITY_ABBREVIATIONS[fb.ability]} +{fb.value}
          </span>
        ))}
        {choices.map((block, blockIdx) => {
          const selections = raceAsiChoices[blockIdx] ?? []
          const slotAnchors = block.from.slice(0, block.count)
          return slotAnchors.map((slotAnchor) => {
            const slotIdx = block.from.indexOf(slotAnchor)
            const selected = selections[slotIdx] ?? ''
            // Disable abilities chosen in any other slot of this block OR any slot of another block
            const takenByOthers = new Set([
              ...selections.filter((s, si) => si !== slotIdx && s !== ''),
              ...choices.flatMap((_, bi) =>
                bi !== blockIdx ? (raceAsiChoices[bi] ?? []).filter((s) => s !== '') : [],
              ),
            ])
            return (
              <div
                key={`${block.amount}|${block.from.join('-')}|${slotAnchor}`}
                className="flex items-center gap-1"
              >
                <span className="text-xs text-muted-foreground">+{block.amount}</span>
                <Select value={selected} onValueChange={(v) => updateChoice(blockIdx, slotIdx, v)}>
                  <SelectTrigger className="h-7 w-24 px-2 text-xs">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {block.from.map((ab) => (
                      <SelectItem
                        key={ab}
                        value={ab}
                        disabled={takenByOthers.has(ab)}
                        className="text-xs"
                      >
                        {ABILITY_ABBREVIATIONS[ab]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}

function buildRacialBonuses(
  raceAsiData: ReturnType<typeof getRaceAbilityData>,
  raceAsiChoices: string[][],
): Partial<Record<AbilityName, number>> {
  const bonuses: Partial<Record<AbilityName, number>> = {}
  for (const fb of raceAsiData.fixed) {
    bonuses[fb.ability] = (bonuses[fb.ability] ?? 0) + fb.value
  }
  for (const [blockIdx, block] of raceAsiData.choices.entries()) {
    for (const raw of raceAsiChoices[blockIdx] ?? []) {
      const ab = normalizeAbilityName(raw)
      if (ab) bonuses[ab] = (bonuses[ab] ?? 0) + block.amount
    }
  }
  return bonuses
}

function PointBuyPanel({
  scores,
  racialBonuses,
  setScore,
}: {
  scores: Record<AbilityName, number>
  racialBonuses: Partial<Record<AbilityName, number>>
  setScore: (a: AbilityName, v: number) => void
}) {
  const pointsUsed = ABILITY_NAMES.reduce((sum, ab) => sum + (POINT_BUY_COSTS[scores[ab]] ?? 0), 0)
  const remaining = POINT_BUY_BUDGET - pointsUsed
  const budgetPct = Math.min(100, (pointsUsed / POINT_BUY_BUDGET) * 100)

  return (
    <div className="flex flex-col gap-3">
      <div className="shrink-0 p-3 rounded-lg bg-accent/10 border border-accent/30">
        <div className="flex justify-between text-sm font-semibold mb-1.5">
          <span>Points Used</span>
          <span className={cn(remaining < 0 && 'text-destructive font-bold')}>
            {pointsUsed} / {POINT_BUY_BUDGET}
            <span className="text-muted-foreground font-normal ml-2">
              ({remaining >= 0 ? `${remaining} remaining` : `${-remaining} over budget`})
            </span>
          </span>
        </div>
        <Progress value={budgetPct} className="h-2" />
      </div>
      <div className="grid grid-cols-3 grid-rows-2 gap-3 max-h-[340px]">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? POINT_BUY_MIN
          const costNow = POINT_BUY_COSTS[score] ?? 0
          const costNext = POINT_BUY_COSTS[score + 1] ?? 999
          const canDecrease = score > POINT_BUY_MIN
          const canIncrease = score < POINT_BUY_MAX && remaining >= costNext - costNow
          return (
            <AbilityScoreCard
              key={ability}
              ability={ability}
              score={score}
              bonus={racialBonuses[ability]}
            >
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-8 w-8 p-0 text-base font-bold',
                    !canDecrease && 'opacity-35 cursor-not-allowed',
                  )}
                  disabled={!canDecrease}
                  onClick={() => setScore(ability, score - 1)}
                >
                  −
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    'h-8 w-8 p-0 text-base font-bold',
                    !canIncrease && 'opacity-35 cursor-not-allowed',
                  )}
                  disabled={!canIncrease}
                  onClick={() => setScore(ability, score + 1)}
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

function StandardArrayPanel({
  scores,
  racialBonuses,
  setAllScores,
}: {
  scores: Record<AbilityName, number>
  racialBonuses: Partial<Record<AbilityName, number>>
  setAllScores: (next: Partial<Record<AbilityName, number>>) => void
}) {
  const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>(() =>
    isValidStandardArrayAssignment(scores) ? { ...scores } : { ...DEFAULT_STANDARD_SCORES },
  )

  useEffect(() => {
    if (!isValidStandardArrayAssignment(scores)) {
      const fallback = { ...DEFAULT_STANDARD_SCORES }
      setAssignments(fallback)
      setAllScores(fallback)
    }
    // Intentionally ignore `assignments` to avoid resetting user edits on each local assignment change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, setAllScores])

  const assign = (ability: AbilityName, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    const next = { ...assignments }
    const current = next[ability]
    const swapTarget = ABILITY_NAMES.find((ab) => ab !== ability && next[ab] === value)
    if (swapTarget) next[swapTarget] = current ?? STANDARD_ARRAY[0] ?? 8
    next[ability] = value
    setAssignments(next)
    const update: Partial<Record<AbilityName, number>> = {}
    for (const ab of ABILITY_NAMES) if (next[ab] !== undefined) update[ab] = next[ab] as number
    setAllScores(update)
  }

  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-3 max-h-[340px]">
      {ABILITY_NAMES.map((ability) => {
        const base = assignments[ability]
        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={base ?? 8}
            bonus={racialBonuses[ability]}
          >
            <div className="flex justify-center">
              <Select
                value={base !== undefined ? String(base) : ''}
                onValueChange={(v) => assign(ability, v)}
              >
                <SelectTrigger className="h-9 w-[90px] px-2 text-sm">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="w-[90px] min-w-[90px]">
                  {STANDARD_ARRAY.map((v) => (
                    <SelectItem key={v} value={String(v)} className="pr-6">
                      {v}
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

function CustomPanel({
  scores,
  racialBonuses,
  setScore,
}: {
  scores: Record<AbilityName, number>
  racialBonuses: Partial<Record<AbilityName, number>>
  setScore: (a: AbilityName, v: number) => void
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-3 max-h-[340px]">
      {ABILITY_NAMES.map((ability) => {
        const val = scores[ability] ?? ABILITY_SCORE_MIN
        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={val}
            bonus={racialBonuses[ability]}
          >
            <div className="flex justify-center">
              <Input
                type="number"
                min={1}
                max={30}
                value={val}
                className="h-10 w-24 text-center font-mono font-bold text-base"
                onChange={(e) =>
                  setScore(ability, Math.min(30, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </div>
          </AbilityScoreCard>
        )
      })}
    </div>
  )
}

export function AbilityScoresStep({ data, onChange }: StepProps) {
  const gameData = useGameDataStore((s) => s.gameData)
  const method = (data.abilityScoreMethod ?? 'point-buy') as string
  const showRaceOriginBonuses = usesRaceOriginBenefits(
    (data.originSystem || '2014') as '2014' | '2024',
  )
  const fallbackScores =
    method === 'standard-array'
      ? DEFAULT_STANDARD_SCORES
      : method === 'custom'
        ? DEFAULT_CUSTOM_SCORES
        : DEFAULT_POINT_BUY_SCORES
  const scores = (data.abilityScores ?? fallbackScores) as Record<AbilityName, number>

  const raceObj = (gameData?.races ?? []).find(
    (r) => r.name === data.race && (!data.raceSource || r.source === data.raceSource),
  )
  const subraceObj = raceObj?.subraces?.find((sr) => sr.name === data.subrace)
  const normalizedSelection = normalizeRaceSelectionForOriginSystem(
    raceObj,
    subraceObj,
    (data.originSystem || '2014') as '2014' | '2024',
  )
  const raceAsiData = getRaceAbilityData(
    normalizedSelection.race,
    normalizedSelection.subrace,
    (data.raceAsiBlockIndex ?? 0) as 0 | 1,
  )
  const isLineageRaceAsiFallback =
    showRaceOriginBonuses && hasFlexibleRaceOriginAsi(normalizedSelection.race)
  const racialBonuses = showRaceOriginBonuses
    ? buildRacialBonuses(raceAsiData, data.raceAsiChoices ?? [])
    : {}

  const setAllScores = (next: Partial<Record<AbilityName, number>>) => {
    onChange({ abilityScores: next as Record<string, number> })
  }

  const setScore = (ability: AbilityName, value: number) => {
    onChange({ abilityScores: { ...scores, [ability]: value } })
  }

  return (
    <div className="flex flex-col max-w-2xl mx-auto w-full">
      <Tabs value={method} className="gap-0">
        <TabsContent value="point-buy" className="min-h-0 flex flex-col">
          <PointBuyPanel scores={scores} racialBonuses={racialBonuses} setScore={setScore} />
        </TabsContent>
        <TabsContent value="standard-array" className="min-h-0 flex flex-col">
          <StandardArrayPanel
            scores={scores}
            racialBonuses={racialBonuses}
            setAllScores={setAllScores}
          />
        </TabsContent>
        <TabsContent value="custom" className="min-h-0 flex flex-col">
          <CustomPanel scores={scores} racialBonuses={racialBonuses} setScore={setScore} />
        </TabsContent>
      </Tabs>
      {showRaceOriginBonuses ? (
        <RaceAsiBonuses
          data={data}
          onChange={onChange}
          raceAsiData={raceAsiData}
          isLineageRaceAsiFallback={isLineageRaceAsiFallback}
        />
      ) : null}
    </div>
  )
}
