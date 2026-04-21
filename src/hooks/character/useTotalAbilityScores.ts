import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  type AbilityName,
  type AbilityScores,
  buildBackgroundBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores'
import {
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { buildRacialBonuses } from '@/pages/build/ability-scores/model/data'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

/**
 * Returns fully derived total ability scores (base + racial + background + ASI bonuses),
 * using the same logic as AbilityScoresPage so values are always consistent.
 */
export function useTotalAbilityScores(character: Character): AbilityScores {
  const { races, backgrounds } = useFilteredGameData()

  const selectedRace = useMemo(
    () =>
      races.find((r) => matchesGameDataEntry(character.race, character.raceSource, r)) as
        | Race5e
        | undefined,
    [races, character.race, character.raceSource],
  )

  const subraceData = useMemo(
    () =>
      selectedRace?.subraces?.find(
        (sr: Race5e) =>
          sr.name === character.subrace && (sr.source ?? '') === (character.subraceSource ?? ''),
      ) as Race5e | undefined,
    [selectedRace, character.subrace, character.subraceSource],
  )

  const normalizedRaceSelection = useMemo(
    () =>
      normalizeRaceSelectionForOriginSystem(
        selectedRace,
        subraceData,
        character.originSystem ?? '2014',
      ),
    [selectedRace, subraceData, character.originSystem],
  )

  const raceAsiData = useMemo(
    () =>
      getRaceAbilityData(
        normalizedRaceSelection.race,
        normalizedRaceSelection.subrace,
        (character.raceAsiBlockIndex ?? 0) as 0 | 1,
      ),
    [normalizedRaceSelection, character.raceAsiBlockIndex],
  )

  const hasDataDrivenRacialBonuses = raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0

  const provenanceRacialBonuses = useMemo(() => {
    const bonuses: Partial<Record<AbilityName, number>> = {}
    for (const record of character.provenance?.abilityBonuses ?? []) {
      const { sourceType, sourceName, sourceRef } = record.sourceTag
      const isCurrentRace =
        sourceType === 'race' &&
        sourceName === character.race &&
        (sourceRef ?? '') === (character.raceSource ?? '')
      const isCurrentSubrace =
        sourceType === 'subrace' &&
        sourceName === (character.subrace ?? '') &&
        (sourceRef ?? '') === (character.subraceSource ?? '')
      if (!isCurrentRace && !isCurrentSubrace) continue
      const ability = record.ability as AbilityName
      bonuses[ability] = (bonuses[ability] ?? 0) + record.value
    }
    return bonuses
  }, [
    character.provenance?.abilityBonuses,
    character.race,
    character.raceSource,
    character.subrace,
    character.subraceSource,
  ])

  const racialBonuses = useMemo(
    () =>
      hasDataDrivenRacialBonuses
        ? buildRacialBonuses(raceAsiData, character.raceAsiChoices ?? [])
        : provenanceRacialBonuses,
    [hasDataDrivenRacialBonuses, raceAsiData, character.raceAsiChoices, provenanceRacialBonuses],
  )

  const selectedBg = useMemo(
    () =>
      backgrounds.find((b) =>
        matchesGameDataEntry(character.background, character.backgroundSource, b),
      ),
    [backgrounds, character.background, character.backgroundSource],
  )

  const bgAsiData = useMemo(
    () =>
      getBackgroundAbilityData(
        normalizeBackgroundForOriginSystem(selectedBg, character.originSystem ?? '2014') as
          | {
              ability?: unknown[]
            }
          | undefined,
      ),
    [selectedBg, character.originSystem],
  )

  const backgroundBonuses = useMemo(
    () =>
      buildBackgroundBonuses(
        bgAsiData,
        character.backgroundAsiBlockIndex ?? 0,
        character.backgroundAsiChoices ?? [],
      ),
    [bgAsiData, character.backgroundAsiBlockIndex, character.backgroundAsiChoices],
  )

  return useMemo(() => {
    const total = { ...character.abilityScores }

    for (const [ability, bonus] of Object.entries(racialBonuses)) {
      total[ability as AbilityName] = (total[ability as AbilityName] ?? 0) + (bonus ?? 0)
    }
    for (const [ability, bonus] of Object.entries(backgroundBonuses)) {
      total[ability as AbilityName] = (total[ability as AbilityName] ?? 0) + (bonus ?? 0)
    }
    for (const choice of character.asiChoices ?? []) {
      for (const [ability, amount] of Object.entries(choice.abilityChanges)) {
        total[ability as AbilityName] = (total[ability as AbilityName] ?? 0) + amount
      }
    }

    return total
  }, [character.abilityScores, racialBonuses, backgroundBonuses, character.asiChoices])
}
