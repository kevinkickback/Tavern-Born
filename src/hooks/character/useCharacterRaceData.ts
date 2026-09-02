import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useRaceLookup } from '@/hooks/data/useGameData'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export interface CharacterRaceData {
  /** The parent race entry from game data, if found. */
  parentRace: Race5e | undefined
  /** The resolved subrace entry (nested or top-level), if found. */
  subraceData: Race5e | undefined
  /** Spell grant blocks merged from parent race and subrace, filtered for the active subrace. */
  mergedAdditionalSpells: NonNullable<Race5e['additionalSpells']>
  /** Display name for the race/subrace combination (used in spell profile labelling). */
  displayName: string | undefined
  /** Source code for display purposes. */
  displaySource: string | undefined
}

/**
 * Returns resolved race and subrace data for the given character,
 * including merged spell grants and display name/source.
 */
export function useCharacterRaceData(character: Character | null | undefined): CharacterRaceData {
  const { races: allRaces } = useFilteredGameData()
  const rawRaceLookup = useRaceLookup()
  const filteredRaceLookup = useMemo(() => buildRaceLookup(allRaces), [allRaces])

  return useMemo(() => {
    if (!character?.race) {
      return {
        parentRace: undefined,
        subraceData: undefined,
        mergedAdditionalSpells: [],
        displayName: undefined,
        displaySource: undefined,
      }
    }

    const {
      parentRace: parentMatch,
      subraceData: subraceMatch,
      subraceIsNested,
    } = resolveRaceReference(
      {
        name: character.race,
        source: character.raceSource,
        subraceName: character.subrace,
        subraceSource: character.subraceSource,
      },
      { racesByKey: filteredRaceLookup },
      { racesByKey: rawRaceLookup },
    )

    const parentSpells = parentMatch?.additionalSpells ?? []
    const filteredParentSpells =
      character.subrace && parentSpells.some((s) => !!s.name)
        ? parentSpells.filter(
            (s) => !s.name || s.name.toLowerCase() === character.subrace?.toLowerCase(),
          )
        : parentSpells
    const subraceSpells = subraceMatch?.additionalSpells ?? []
    const mergedSpells = [...filteredParentSpells, ...subraceSpells]

    const displayName =
      subraceIsNested && subraceMatch
        ? `${subraceMatch.name} ${parentMatch?.name ?? character.race ?? ''}`
        : (subraceMatch?.name ?? character.subrace ?? parentMatch?.name ?? character.race)
    const displaySource = subraceMatch?.source ?? parentMatch?.source

    return {
      parentRace: parentMatch,
      subraceData: subraceMatch,
      mergedAdditionalSpells: mergedSpells,
      displayName,
      displaySource,
    }
  }, [
    character?.race,
    character?.subrace,
    character?.raceSource,
    character?.subraceSource,
    filteredRaceLookup,
    rawRaceLookup,
  ])
}
