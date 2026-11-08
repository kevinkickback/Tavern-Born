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
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  formatAbilityBonus,
  formatBackgroundAbilityPatterns,
  formatRacialAbilityPatterns,
} from '@/lib/calculations/abilityScoreDisplay'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getRaceAbilityData,
  hasFlexibleRaceOriginAsi,
  isValidStandardArrayAssignment,
  makeDefaultAbilityScores,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
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
import type { StepProps } from '../types'

interface AbilityScoresStepProps extends StepProps {
  raceResolution: ResolvedRaceReference
  backgroundAbilityData?: BackgroundAbilityData
}

const DEFAULT_STANDARD_SCORES = makeDefaultStandardArrayAssignment()
const DEFAULT_POINT_BUY_SCORES = makeDefaultAbilityScores(POINT_BUY_MIN)
const DEFAULT_CUSTOM_SCORES = makeDefaultAbilityScores(ABILITY_SCORE_MIN)

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

    const intraConflict = blockSelections.findIndex((s, si) => si !== slotIdx && s === ability)
    if (intraConflict >= 0) blockSelections[intraConflict] = blockSelections[slotIdx] ?? ''

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
    <section className="flex flex-col gap-3 border-y border-border bg-workspace-pane p-4">
      <div>
        <h3 className="text-sm font-semibold">Racial Bonuses</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {choices.length > 0
            ? formatRacialAbilityPatterns(raceAsiData)
            : 'Apply the bonuses granted by your selected race.'}
        </p>
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
      <div className="flex flex-wrap items-center gap-2">
        {fixed.map((fb) => (
          <span
            key={`${fb.ability}|${fb.value}`}
            className="rounded border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success-foreground"
          >
            {formatAbilityBonus(fb.ability, fb.value)}
          </span>
        ))}
        {choices.map((block, blockIdx) => {
          const selections = raceAsiChoices[blockIdx] ?? []
          const slotAnchors = block.from.slice(0, block.count)
          return slotAnchors.map((slotAnchor) => {
            const slotIdx = block.from.indexOf(slotAnchor)
            const selected = selections[slotIdx] ?? ''
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
    </section>
  )
}

function BackgroundAsiBonuses({
  data,
  onChange,
  abilityData,
}: Pick<StepProps, 'data' | 'onChange'> & { abilityData: BackgroundAbilityData }) {
  const { blockIndex = 0, choices = [] } = data.backgroundAsi ?? {}
  const block = abilityData.blocks[blockIndex]
  const hasChoices = choices.some(Boolean)
  if (!block && !hasChoices) return null
  const patterns = formatBackgroundAbilityPatterns(abilityData)

  return (
    <section className="space-y-3 border-y border-border bg-workspace-pane p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Background Bonuses</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {block
              ? `Assign the bonuses from ${data.background} now, or finish them later in the Builder.`
              : 'These bonuses are no longer available with the current source data.'}
          </p>
        </div>
        {hasChoices && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ backgroundAsi: undefined })}>
            Clear bonuses
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {patterns.length > 1 && (
          <Select
            value={String(blockIndex)}
            onValueChange={(value) =>
              onChange({ backgroundAsi: { blockIndex: Number(value), choices: [] } })
            }
          >
            <SelectTrigger
              aria-label="Background bonus distribution"
              className="max-w-full text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {patterns.map((pattern, index) => (
                <SelectItem key={JSON.stringify([index, pattern])} value={String(index)}>
                  {pattern}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {block &&
          Array.from(block.weights.entries(), ([index, weight]) => (
            <Select
              key={index}
              value={choices[index] ?? ''}
              onValueChange={(ability) => {
                const next = Array.from(block.weights, (_, slot) => choices[slot] ?? '')
                next[index] = ability
                onChange({ backgroundAsi: { blockIndex, choices: next } })
              }}
            >
              <SelectTrigger
                aria-label={`Background bonus ${index + 1} (+${weight})`}
                className="text-xs"
              >
                <SelectValue placeholder={`+${weight} Choose ability`} />
              </SelectTrigger>
              <SelectContent>
                {block.from.map((ability) => (
                  <SelectItem
                    key={ability}
                    value={ability}
                    disabled={choices.some(
                      (selected, slot) => slot !== index && selected === ability,
                    )}
                  >
                    +{weight} {ABILITY_ABBREVIATIONS[ability]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
      </div>
    </section>
  )
}

function PointBuyPanel({
  scores,
  abilityBonuses,
  setScore,
  remaining,
}: {
  scores: Record<AbilityName, number>
  abilityBonuses: Partial<Record<AbilityName, number>>
  setScore: (a: AbilityName, v: number) => void
  remaining: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @min-[26rem]:grid-cols-3 @min-[50rem]:grid-cols-6">
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
            bonus={abilityBonuses[ability]}
            variant="wizard"
          >
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'h-8 w-8 p-0 text-base font-bold',
                  !canDecrease && 'opacity-35 cursor-not-allowed',
                )}
                aria-label={`Decrease ${ability}`}
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
                aria-label={`Increase ${ability}`}
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
  )
}

function StandardArrayPanel({
  scores,
  abilityBonuses,
  setAllScores,
}: {
  scores: Record<AbilityName, number>
  abilityBonuses: Partial<Record<AbilityName, number>>
  setAllScores: (next: Partial<Record<AbilityName, number>>) => void
}) {
  const assignments = isValidStandardArrayAssignment(scores) ? scores : DEFAULT_STANDARD_SCORES

  const assign = (ability: AbilityName, raw: string) => {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    const next = { ...assignments, [ability]: value }
    const swapTarget = ABILITY_NAMES.find((ab) => ab !== ability && assignments[ab] === value)
    if (swapTarget) next[swapTarget] = assignments[ability]
    setAllScores(next)
  }
  return (
    <div className="grid grid-cols-2 gap-3 @min-[26rem]:grid-cols-3 @min-[50rem]:grid-cols-6">
      {ABILITY_NAMES.map((ability) => {
        const base = assignments[ability]
        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={base ?? 8}
            bonus={abilityBonuses[ability]}
            variant="wizard"
          >
            <div className="flex justify-center">
              <Select
                value={base !== undefined ? String(base) : ''}
                onValueChange={(v) => assign(ability, v)}
              >
                <SelectTrigger
                  aria-label={`${ability} base score`}
                  className="h-9 w-[90px] px-2 text-sm"
                >
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
  abilityBonuses,
  setScore,
}: {
  scores: Record<AbilityName, number>
  abilityBonuses: Partial<Record<AbilityName, number>>
  setScore: (a: AbilityName, v: number) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @min-[26rem]:grid-cols-3 @min-[50rem]:grid-cols-6">
      {ABILITY_NAMES.map((ability) => {
        const val = scores[ability] ?? ABILITY_SCORE_MIN
        return (
          <AbilityScoreCard
            key={ability}
            ability={ability}
            score={val}
            bonus={abilityBonuses[ability]}
            variant="wizard"
          >
            <div className="flex justify-center">
              <Input
                aria-label={`${ability} base score`}
                type="number"
                min={ABILITY_SCORE_MIN}
                max={ABILITY_SCORE_ABSOLUTE_MAX}
                value={val}
                className="h-10 w-24 text-center font-mono font-bold text-base"
                onChange={(e) =>
                  setScore(
                    ability,
                    Math.min(
                      ABILITY_SCORE_ABSOLUTE_MAX,
                      Math.max(ABILITY_SCORE_MIN, Number(e.target.value) || ABILITY_SCORE_MIN),
                    ),
                  )
                }
              />
            </div>
          </AbilityScoreCard>
        )
      })}
    </div>
  )
}

export function AbilityScoresStep({
  data,
  onChange,
  raceResolution,
  backgroundAbilityData,
}: AbilityScoresStepProps) {
  const method = data.abilityScoreMethod || 'point-buy'
  const methods = getAbilityScoreMethodOptions(data.originSystem || '2014')
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

  const raceObj = raceResolution.parentRace
  const subraceObj = raceResolution.subraceData
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
  const abilityBonuses = showRaceOriginBonuses
    ? buildRacialBonuses(raceAsiData, data.raceAsiChoices ?? [])
    : backgroundAbilityData && data.backgroundAsi
      ? buildBackgroundBonuses(
          backgroundAbilityData,
          data.backgroundAsi.blockIndex,
          data.backgroundAsi.choices,
        )
      : {}

  const pointsUsed = ABILITY_NAMES.reduce(
    (sum, ability) => sum + (POINT_BUY_COSTS[scores[ability]] ?? 0),
    0,
  )
  const remaining = POINT_BUY_BUDGET - pointsUsed
  const setAllScores = (next: Partial<Record<AbilityName, number>>) => {
    onChange({ abilityScores: next as Record<string, number> })
  }

  const setScore = (ability: AbilityName, value: number) => {
    onChange({ abilityScores: { ...scores, [ability]: value } })
  }

  return (
    <div className="@container flex w-full flex-col">
      <Tabs
        value={method}
        onValueChange={(value) => onChange({ abilityScoreMethod: value })}
        className="gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-0">
            {methods.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-md border border-border bg-workspace-pane px-3 py-1.5 data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="ghost" size="sm" onClick={() => setAllScores(fallbackScores)}>
            Reset base scores
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {methods.find((option) => option.value === method)?.description}
        </p>
        {method === 'point-buy' && (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <strong className={cn(remaining < 0 && 'text-destructive')}>
                {remaining} of {POINT_BUY_BUDGET} points remaining
              </strong>
              <span className="text-xs text-muted-foreground">{pointsUsed} points used</span>
            </div>
            <Progress
              aria-label="Point buy budget used"
              value={Math.min(100, (pointsUsed / POINT_BUY_BUDGET) * 100)}
              className="h-2"
            />
          </div>
        )}
        {showRaceOriginBonuses ? (
          <RaceAsiBonuses
            data={data}
            onChange={onChange}
            raceAsiData={raceAsiData}
            isLineageRaceAsiFallback={isLineageRaceAsiFallback}
          />
        ) : backgroundAbilityData ? (
          <BackgroundAsiBonuses
            data={data}
            onChange={onChange}
            abilityData={backgroundAbilityData}
          />
        ) : null}
        <TabsContent value="point-buy" className="flex min-h-0 flex-col">
          <PointBuyPanel
            scores={scores}
            abilityBonuses={abilityBonuses}
            setScore={setScore}
            remaining={remaining}
          />
        </TabsContent>
        <TabsContent value="standard-array" className="flex min-h-0 flex-col">
          <StandardArrayPanel
            scores={scores}
            abilityBonuses={abilityBonuses}
            setAllScores={setAllScores}
          />
        </TabsContent>
        <TabsContent value="custom" className="flex min-h-0 flex-col">
          <CustomPanel scores={scores} abilityBonuses={abilityBonuses} setScore={setScore} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
