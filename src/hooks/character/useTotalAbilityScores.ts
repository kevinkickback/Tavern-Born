import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  type AbilityName,
  type AbilityScores,
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
  type RaceAbilityData,
} from '@/lib/calculations/abilityScores'
import {
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { buildRacialBonuses } from '@/pages/build/ability-scores/model/data'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

/** All derived data from the ability score calculation pipeline, including intermediate values. */
export interface TotalAbilityScoresData {
  /** Final computed total ability scores (base + racial + background + ASI bonuses). */
  total: AbilityScores
  selectedRace: Race5e | undefined
  subraceData: Race5e | undefined
  raceAsiBlockIndex: 0 | 1
  normalizedRaceSelection: ReturnType<typeof normalizeRaceSelectionForOriginSystem>
  raceAsiData: RaceAbilityData
  hasDataDrivenRacialBonuses: boolean
  racialBonuses: Partial<Record<AbilityName, number>>
  normalizedBackground: { ability?: unknown[] } | undefined
  bgAsiData: BackgroundAbilityData
  backgroundBonuses: Partial<Record<AbilityName, number>>
}

/**
 * Returns fully derived total ability scores and all intermediate calculation data,
 * using the same logic as AbilityScoresPage so values are always consistent.
 */
export function useTotalAbilityScores(
  character: Character | null | undefined,
): TotalAbilityScoresData {
  const { races, backgrounds } = useFilteredGameData()

  const selectedRace = useMemo(
    () =>
      character
        ? (races.find((r) => matchesGameDataEntry(character.race, character.raceSource, r)) as
            | Race5e
            | undefined)
        : undefined,
    [races, character],
  )

  const subraceData = useMemo(
    () =>
      selectedRace?.subraces?.find(
        (sr: Race5e) =>
          sr.name === character?.subrace && (sr.source ?? '') === (character?.subraceSource ?? ''),
      ) as Race5e | undefined,
    [selectedRace, character],
  )

  const normalizedRaceSelection = useMemo(
    () =>
      normalizeRaceSelectionForOriginSystem(
        selectedRace,
        subraceData,
        character?.originSystem ?? '2014',
      ),
    [selectedRace, subraceData, character],
  )

  const raceAsiData = useMemo(
    () =>
      getRaceAbilityData(
        normalizedRaceSelection.race,
        normalizedRaceSelection.subrace,
        (character?.raceAsiBlockIndex ?? 0) as 0 | 1,
      ),
    [normalizedRaceSelection, character],
  )

  const hasDataDrivenRacialBonuses = raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0

  const provenanceRacialBonuses = useMemo(() => {
    const bonuses: Partial<Record<AbilityName, number>> = {}
    for (const record of character?.provenance?.abilityBonuses ?? []) {
      const { sourceType, sourceName, sourceRef } = record.sourceTag
      const isCurrentRace =
        sourceType === 'race' &&
        sourceName === character?.race &&
        (sourceRef ?? '') === (character?.raceSource ?? '')
      const isCurrentSubrace =
        sourceType === 'subrace' &&
        sourceName === (character?.subrace ?? '') &&
        (sourceRef ?? '') === (character?.subraceSource ?? '')
      if (!isCurrentRace && !isCurrentSubrace) continue
      const ability = record.ability as AbilityName
      bonuses[ability] = (bonuses[ability] ?? 0) + record.value
    }
    return bonuses
  }, [character])

  const racialBonuses = useMemo(
    () =>
      hasDataDrivenRacialBonuses
        ? buildRacialBonuses(raceAsiData, character?.raceAsiChoices ?? [])
        : provenanceRacialBonuses,
    [hasDataDrivenRacialBonuses, raceAsiData, character, provenanceRacialBonuses],
  )

  const selectedBg = useMemo(
    () =>
      character
        ? backgrounds.find((b) =>
            matchesGameDataEntry(character.background, character.backgroundSource, b),
          )
        : undefined,
    [backgrounds, character],
  )

  const normalizedBackground = useMemo(
    () =>
      normalizeBackgroundForOriginSystem(selectedBg, character?.originSystem ?? '2014') as
        | { ability?: unknown[] }
        | undefined,
    [selectedBg, character],
  )

  const bgAsiData = useMemo(
    () => getBackgroundAbilityData(normalizedBackground),
    [normalizedBackground],
  )

  const backgroundBonuses = useMemo(
    () =>
      buildBackgroundBonuses(
        bgAsiData,
        character?.backgroundAsiBlockIndex ?? 0,
        character?.backgroundAsiChoices ?? [],
      ),
    [bgAsiData, character],
  )

  const total = useMemo(() => {
    const t = {
      ...(character?.abilityScores ?? {
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      }),
    }

    for (const [ability, bonus] of Object.entries(racialBonuses)) {
      t[ability as AbilityName] = (t[ability as AbilityName] ?? 0) + (bonus ?? 0)
    }
    for (const [ability, bonus] of Object.entries(backgroundBonuses)) {
      t[ability as AbilityName] = (t[ability as AbilityName] ?? 0) + (bonus ?? 0)
    }
    for (const choice of character?.asiChoices ?? []) {
      for (const [ability, amount] of Object.entries(choice.abilityChanges)) {
        t[ability as AbilityName] = (t[ability as AbilityName] ?? 0) + amount
      }
    }

    return t
  }, [character, racialBonuses, backgroundBonuses])

  return {
    total,
    selectedRace,
    subraceData,
    raceAsiBlockIndex: (character?.raceAsiBlockIndex ?? 0) as 0 | 1,
    normalizedRaceSelection,
    raceAsiData,
    hasDataDrivenRacialBonuses,
    racialBonuses,
    normalizedBackground,
    bgAsiData,
    backgroundBonuses,
  }
}
