import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  deriveEffectiveAbilityScores,
  type EffectiveAbilityScoreData,
} from '@/lib/calculations/characterCalculationContext'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export interface TotalAbilityScoresData
  extends Omit<
    EffectiveAbilityScoreData,
    'base' | 'modifiers' | 'backgroundAbilityData' | 'normalizedBackground'
  > {
  selectedRace: Race5e | undefined
  subraceData: Race5e | undefined
  raceAsiBlockIndex: 0 | 1
  normalizedBackground: { ability?: unknown[] } | undefined
  bgAsiData: EffectiveAbilityScoreData['backgroundAbilityData']
}

/** Returns the canonical effective ability-score projection and its source breakdown. */
export function useTotalAbilityScores(
  character: Character | null | undefined,
): TotalAbilityScoresData {
  const context = useCharacterCalculationContext(character)
  const fallback = useMemo(() => deriveEffectiveAbilityScores(character), [character])
  const data = context?.abilityScores ?? fallback

  return {
    total: data.total,
    selectedRace: context?.raceResolution.parentRace,
    subraceData: context?.raceResolution.subraceData,
    raceAsiBlockIndex: (character?.raceAsiBlockIndex ?? 0) as 0 | 1,
    normalizedRaceSelection: data.normalizedRaceSelection,
    raceAsiData: data.raceAsiData,
    hasDataDrivenRacialBonuses: data.hasDataDrivenRacialBonuses,
    racialBonuses: data.racialBonuses,
    normalizedBackground: data.normalizedBackground,
    bgAsiData: data.backgroundAbilityData,
    backgroundBonuses: data.backgroundBonuses,
    asiBonuses: data.asiBonuses,
  }
}
