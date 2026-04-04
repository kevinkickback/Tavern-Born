import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { StepProps } from '../types'
import {
  ABILITY_NAMES,
  ABILITY_ABBREVIATIONS,
  formatModifier,
  isValidStandardArrayAssignment,
  getRaceAbilityData,
  normalizeAbilityName,
  type AbilityName,
} from '@/lib/calculations/abilityScores'
import {
  STANDARD_ARRAY,
  POINT_BUY_COSTS,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
  getAbilityModifier,
} from '@/lib/calculations/gameRules'
import { useGameDataStore } from '@/store/gameDataStore'
import { cn } from '@/lib/utils'

const DEFAULT_STANDARD_SCORES: Partial<Record<AbilityName, number>> = ABILITY_NAMES.reduce((acc, ab, idx) => {
  acc[ab] = STANDARD_ARRAY[idx] ?? 8
  return acc
}, {} as Partial<Record<AbilityName, number>>)

const DEFAULT_POINT_BUY_SCORES: Record<AbilityName, number> = {
  strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8,
}

function ScoreCard({ ability, score, racialBonus, children }: { ability: AbilityName; score: number; racialBonus?: number; children: React.ReactNode }) {
  const bonus = racialBonus ?? 0
  const total = score + bonus
  const mod = getAbilityModifier(total)
  return (
    <div className="border rounded-lg p-3 bg-card/50 border-border flex flex-col items-center justify-between min-h-0 max-h-[160px]">
      <div className="text-xs font-bold text-accent uppercase tracking-wider">
        {ABILITY_ABBREVIATIONS[ability]}
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold font-mono leading-none">{total}</div>
        {bonus !== 0 && (
          <div className="text-xs text-emerald-500 font-semibold leading-none mt-0.5">
            {score} {bonus > 0 ? '+' : ''}{bonus}
          </div>
        )}
        <div className={cn('text-base font-semibold mt-0.5', mod >= 0 ? 'text-success' : 'text-destructive')}>
          {formatModifier(mod)}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function RaceAsiBonuses({
  data,
  onChange,
  raceAsiData,
}: {
  data: StepProps['data']
  onChange: StepProps['onChange']
  raceAsiData: ReturnType<typeof getRaceAbilityData>
}) {
  const { fixed, choices } = raceAsiData
  if (fixed.length === 0 && choices.length === 0) return null

  const raceAsiChoices: string[][] = data.raceAsiChoices ?? []

  const updateChoice = (blockIdx: number, slotIdx: number, ability: string) => {
    const blockSelections = [...(raceAsiChoices[blockIdx] ?? [])]
    // Swap: if another slot in this block already has this ability, give it the current slot's value
    const conflictIdx = blockSelections.findIndex((s, si) => si !== slotIdx && s === ability)
    if (conflictIdx >= 0) blockSelections[conflictIdx] = blockSelections[slotIdx] ?? ''
    blockSelections[slotIdx] = ability
    const newChoices = [...raceAsiChoices]
    while (newChoices.length <= blockIdx) newChoices.push([])
    newChoices[blockIdx] = blockSelections
    onChange({ raceAsiChoices: newChoices })
  }

  return (
    <div className="shrink-0 mt-3 p-3 rounded-lg bg-muted/20 border border-border">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Racial Bonuses</div>
      <div className="flex flex-wrap gap-2">
        {fixed.map((fb, i) => (
          <span key={i} className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 font-semibold">
            {ABILITY_ABBREVIATIONS[fb.ability]} +{fb.value}
          </span>
        ))}
        {choices.map((block, blockIdx) => {
          const selections = raceAsiChoices[blockIdx] ?? []
          return Array.from({ length: block.count }, (_, slotIdx) => {
            const selected = selections[slotIdx] ?? ''
            // Disable abilities already chosen in another slot of the same block
            const takenByOthers = new Set(
              selections.filter((s, si) => si !== slotIdx && s !== '')
            )
            return (
              <div key={`${blockIdx}-${slotIdx}`} className="flex items-center gap-1">
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

function buildRacialBonuses(raceAsiData: ReturnType<typeof getRaceAbilityData>, raceAsiChoices: string[][]): Partial<Record<AbilityName, number>> {
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

function PointBuyPanel({ scores, racialBonuses, setScore }: { scores: Record<AbilityName, number>; racialBonuses: Partial<Record<AbilityName, number>>; setScore: (a: AbilityName, v: number) => void }) {
  const pointsUsed = ABILITY_NAMES.reduce((sum, ab) => sum + (POINT_BUY_COSTS[scores[ab]] ?? 0), 0)
  const remaining = POINT_BUY_BUDGET - pointsUsed
  const budgetPct = Math.min(100, (pointsUsed / POINT_BUY_BUDGET) * 100)

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
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
      <div className="grid grid-cols-3 grid-rows-2 gap-3 flex-1 min-h-0 max-h-[340px]">
        {ABILITY_NAMES.map((ability) => {
          const score = scores[ability] ?? POINT_BUY_MIN
          const costNow = POINT_BUY_COSTS[score] ?? 0
          const costNext = POINT_BUY_COSTS[score + 1] ?? 999
          const canDecrease = score > POINT_BUY_MIN
          const canIncrease = score < POINT_BUY_MAX && remaining >= costNext - costNow
          return (
            <ScoreCard key={ability} ability={ability} score={score} racialBonus={racialBonuses[ability]}>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className={cn('h-8 w-8 p-0 text-base font-bold', !canDecrease && 'opacity-35 cursor-not-allowed')}
                  disabled={!canDecrease}
                  onClick={() => setScore(ability, score - 1)}
                >−</Button>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn('h-8 w-8 p-0 text-base font-bold', !canIncrease && 'opacity-35 cursor-not-allowed')}
                  disabled={!canIncrease}
                  onClick={() => setScore(ability, score + 1)}
                >+</Button>
              </div>
            </ScoreCard>
          )
        })}
      </div>
    </div>
  )
}

function StandardArrayPanel({ scores, racialBonuses, setAllScores }: { scores: Record<AbilityName, number>; racialBonuses: Partial<Record<AbilityName, number>>; setAllScores: (next: Partial<Record<AbilityName, number>>) => void }) {
  const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>(() =>
    isValidStandardArrayAssignment(scores) ? { ...scores } : { ...DEFAULT_STANDARD_SCORES }
  )

  useEffect(() => {
    if (!isValidStandardArrayAssignment(scores)) {
      const fallback = { ...DEFAULT_STANDARD_SCORES }
      setAssignments(fallback)
      setAllScores(fallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assign = (ability: AbilityName, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    const next = { ...assignments }
    const current = next[ability]
    const swapTarget = ABILITY_NAMES.find((ab) => ab !== ability && next[ab] === value)
    if (swapTarget) next[swapTarget] = current ?? (STANDARD_ARRAY[0] ?? 8)
    next[ability] = value
    setAssignments(next)
    const update: Partial<Record<AbilityName, number>> = {}
    for (const ab of ABILITY_NAMES) if (next[ab] !== undefined) update[ab] = next[ab] as number
    setAllScores(update)
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-3 max-h-[340px]">
      {ABILITY_NAMES.map((ability) => {
        const base = assignments[ability]
        return (
          <ScoreCard key={ability} ability={ability} score={base ?? 8} racialBonus={racialBonuses[ability]}>
            <div className="flex justify-center">
              <Select value={base !== undefined ? String(base) : ''} onValueChange={(v) => assign(ability, v)}>
                <SelectTrigger className="h-9 w-[90px] px-2 text-sm">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="w-[90px] min-w-[90px]">
                  {STANDARD_ARRAY.map((v) => (
                    <SelectItem key={v} value={String(v)} className="pr-6">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </ScoreCard>
        )
      })}
    </div>
  )
}

function CustomPanel({ scores, racialBonuses, setScore }: { scores: Record<AbilityName, number>; racialBonuses: Partial<Record<AbilityName, number>>; setScore: (a: AbilityName, v: number) => void }) {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-2 gap-3 max-h-[340px]">
      {ABILITY_NAMES.map((ability) => {
        const val = scores[ability] ?? 10
        return (
          <ScoreCard key={ability} ability={ability} score={val} racialBonus={racialBonuses[ability]}>
            <div className="flex justify-center">
              <Input
                type="number"
                min={1}
                max={30}
                value={val}
                className="h-10 w-24 text-center font-mono font-bold text-base"
                onChange={(e) => setScore(ability, Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          </ScoreCard>
        )
      })}
    </div>
  )
}

export function AbilityScoresStep({ data, onChange }: StepProps) {
  const gameData = useGameDataStore((s) => s.gameData)
  const scores = (data.abilityScores ?? DEFAULT_POINT_BUY_SCORES) as Record<AbilityName, number>
  const method = (data.abilityScoreMethod ?? 'point-buy') as string

  const raceObj = (gameData?.races ?? []).find(
    (r: any) => r.name === data.race && (!data.raceSource || r.source === data.raceSource)
  )
  const subraceObj = raceObj?.subraces?.find((sr: any) => sr.name === data.subrace)
  const raceAsiData = getRaceAbilityData(raceObj, subraceObj)
  const racialBonuses = buildRacialBonuses(raceAsiData, data.raceAsiChoices ?? [])

  const setAllScores = (next: Partial<Record<AbilityName, number>>) => {
    onChange({ abilityScores: next as Record<string, number> })
  }

  const setScore = (ability: AbilityName, value: number) => {
    onChange({ abilityScores: { ...scores, [ability]: value } })
  }

  const handleTabChange = (tab: string) => {
    onChange({ abilityScoreMethod: tab })
    if (tab === 'point-buy') setAllScores({ ...DEFAULT_POINT_BUY_SCORES })
    if (tab === 'standard-array') setAllScores({ ...DEFAULT_STANDARD_SCORES })
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={method} onValueChange={handleTabChange} className="flex-1 min-h-0 gap-0">
        <TabsList className="shrink-0 mb-3">
          <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
          <TabsTrigger value="standard-array">Standard Array</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
        <TabsContent value="point-buy" className="min-h-0 flex flex-col">
          <PointBuyPanel scores={scores} racialBonuses={racialBonuses} setScore={setScore} />
        </TabsContent>
        <TabsContent value="standard-array" className="min-h-0 flex flex-col">
          <StandardArrayPanel scores={scores} racialBonuses={racialBonuses} setAllScores={setAllScores} />
        </TabsContent>
        <TabsContent value="custom" className="min-h-0 flex flex-col">
          <CustomPanel scores={scores} racialBonuses={racialBonuses} setScore={setScore} />
        </TabsContent>
      </Tabs>
      <RaceAsiBonuses data={data} onChange={onChange} raceAsiData={raceAsiData} />
    </div>
  )
}
