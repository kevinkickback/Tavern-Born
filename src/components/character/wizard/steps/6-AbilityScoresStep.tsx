import {
  AbilityScoreEditor,
  type AbilityScoreMethod,
  AbilityScoreMethodTabs,
} from '@/components/character/AbilityScoreEditor'
import { RacialAbilityChoiceSummary } from '@/components/character/RacialAbilityChoiceSummary'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  formatAbilityBonus,
  formatBackgroundAbilityPatterns,
} from '@/lib/calculations/abilityScoreDisplay'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getRaceAbilityData,
  hasFlexibleRaceOriginAsi,
  makeDefaultAbilityScores,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_MIN, POINT_BUY_MIN } from '@/lib/calculations/gameRules'
import {
  normalizeRaceSelectionForOriginSystem,
  usesRaceOriginBenefits,
} from '@/lib/calculations/originSystem'
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
        {choices.length > 0 ? (
          <RacialAbilityChoiceSummary choices={choices} />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Apply the bonuses granted by your selected race.
          </p>
        )}
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

export function AbilityScoresStep({
  data,
  onChange,
  raceResolution,
  backgroundAbilityData,
}: AbilityScoresStepProps) {
  const method = (data.abilityScoreMethod || 'point-buy') as AbilityScoreMethod
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

  const setAllScores = (next: Record<AbilityName, number>) => {
    onChange({ abilityScores: next })
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
          <div className="h-10 min-w-0">
            <AbilityScoreMethodTabs />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAllScores(fallbackScores)}>
            Reset base scores
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {methods.find((option) => option.value === method)?.description}
        </p>
        <AbilityScoreEditor
          method={method}
          scores={scores}
          bonuses={abilityBonuses}
          setScore={setScore}
          setAllScores={setAllScores}
        />
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
      </Tabs>
    </div>
  )
}
