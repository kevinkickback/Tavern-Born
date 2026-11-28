import {
  AbilityScoreEditor,
  AbilityScoreMethodTabs,
} from '@/components/character/AbilityScoreEditor'
import { Tabs } from '@/components/ui/tabs'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import type { AbilityScoreMethod } from '@/lib/calculations/abilityScoreMethods'
import type { AbilityName, BackgroundAbilityData } from '@/lib/calculations/abilityScores'
import { projectDraftAbilityBonuses } from '../projectDraftAbilityBonuses'
import type { CharacterWizardData, StepProps } from '../types'

interface AbilityScoresStepProps extends StepProps {
  raceResolution: ResolvedRaceReference
  backgroundAbilityData?: BackgroundAbilityData
}

export function AbilityScoresStep({
  data,
  onChange,
  raceResolution,
  backgroundAbilityData,
}: AbilityScoresStepProps) {
  const method = data.abilityScoreMethod
  const { abilityBonuses } = projectDraftAbilityBonuses(data, raceResolution, backgroundAbilityData)

  const setAllScores = (next: CharacterWizardData['abilityScores']) => {
    onChange({ abilityScores: next })
  }

  const setScore = (ability: AbilityName, value: number) => {
    onChange({ abilityScores: { ...data.abilityScores, [ability]: value } })
  }

  return (
    <div className="@container flex w-full flex-col">
      <Tabs
        value={method}
        onValueChange={(value) => onChange({ abilityScoreMethod: value as AbilityScoreMethod })}
        className="gap-3 [&>section]:mt-0 [&>section]:bg-workspace-pane"
      >
        <div className="overflow-hidden rounded-lg border border-border bg-workspace-canvas">
          <div className="h-10 min-w-0 border-b border-border bg-workspace-pane px-3">
            <AbilityScoreMethodTabs />
          </div>
          <div className="p-3 sm:p-4">
            <AbilityScoreEditor
              method={method}
              scores={data.abilityScores}
              bonuses={abilityBonuses}
              setScore={setScore}
              setAllScores={setAllScores}
            />
          </div>
        </div>
      </Tabs>
    </div>
  )
}
