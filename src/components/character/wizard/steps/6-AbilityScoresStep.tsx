import {
  BackgroundAbilityBonusPanel,
  RacialAbilityBonusPanel,
} from '@/components/character/AbilityBonusPanels'
import {
  AbilityScoreEditor,
  type AbilityScoreMethod,
  AbilityScoreMethodTabs,
} from '@/components/character/AbilityScoreEditor'
import { Tabs } from '@/components/ui/tabs'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
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
import { isFixedBackgroundAbilityBlock } from '@/lib/calculations/originAbilityChoices'
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

export function AbilityScoresStep({
  data,
  onChange,
  raceResolution,
  backgroundAbilityData,
}: AbilityScoresStepProps) {
  const method = (data.abilityScoreMethod || 'point-buy') as AbilityScoreMethod
  const { blockIndex = 0, choices = [] } = data.backgroundAsi ?? {}
  const backgroundBlock = backgroundAbilityData?.blocks[blockIndex]
  const fixedBackgroundAssignment = isFixedBackgroundAbilityBlock(backgroundBlock)
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
    showRaceOriginBonuses &&
    hasFlexibleRaceOriginAsi(normalizedSelection.race, normalizedSelection.subrace)
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
        <div className="h-10 min-w-0">
          <AbilityScoreMethodTabs />
        </div>
        <AbilityScoreEditor
          method={method}
          scores={scores}
          bonuses={abilityBonuses}
          setScore={setScore}
          setAllScores={setAllScores}
        />
        {showRaceOriginBonuses ? (
          <RacialAbilityBonusPanel
            data={raceAsiData}
            selections={data.raceAsiChoices ?? []}
            distribution={data.raceAsiBlockIndex ?? 0}
            onDistributionChange={
              isLineageRaceAsiFallback
                ? (value) => onChange({ raceAsiBlockIndex: value, raceAsiChoices: [] })
                : undefined
            }
            onChoicesChange={(raceAsiChoices) => onChange({ raceAsiChoices })}
          />
        ) : backgroundAbilityData ? (
          <BackgroundAbilityBonusPanel
            data={backgroundAbilityData}
            block={backgroundBlock}
            fixedAssignment={fixedBackgroundAssignment}
            blockIndex={blockIndex}
            choices={choices}
            onChoicesChange={(blockIndex, choices) =>
              onChange({ backgroundAsi: { blockIndex, choices } })
            }
            onClear={() => onChange({ backgroundAsi: undefined })}
          />
        ) : null}
      </Tabs>
    </div>
  )
}
