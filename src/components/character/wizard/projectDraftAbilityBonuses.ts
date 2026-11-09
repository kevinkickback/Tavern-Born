import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores'
import {
  normalizeRaceSelectionForOriginSystem,
  usesRaceOriginBenefits,
} from '@/lib/calculations/originSystem'
import type { CharacterWizardData } from './types'

export function projectDraftAbilityBonuses(
  data: CharacterWizardData,
  raceResolution: ResolvedRaceReference,
  backgroundAbilityData?: BackgroundAbilityData,
) {
  const showRaceOriginBonuses = usesRaceOriginBenefits(data.originSystem)
  const raceSelection = normalizeRaceSelectionForOriginSystem(
    raceResolution.parentRace,
    raceResolution.subraceData,
    data.originSystem,
  )
  const raceAsiData = getRaceAbilityData(
    raceSelection.race,
    raceSelection.subrace,
    data.raceAsiBlockIndex,
  )
  const abilityBonuses = showRaceOriginBonuses
    ? buildRacialBonuses(raceAsiData, data.raceAsiChoices)
    : backgroundAbilityData && data.backgroundAsi
      ? buildBackgroundBonuses(
          backgroundAbilityData,
          data.backgroundAsi.blockIndex,
          data.backgroundAsi.choices,
        )
      : {}
  return { showRaceOriginBonuses, raceSelection, raceAsiData, abilityBonuses }
}
