import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { matchesGameDataEntry } from '@/lib/characterUtils'
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

    const parentMatch = allRaces.find((r) =>
      matchesGameDataEntry(character.race, character.raceSource, r),
    )

    let subraceMatch: Race5e | undefined
    let subraceIsNested = false
    if (character.subrace && parentMatch?.subraces) {
      subraceMatch = parentMatch.subraces.find(
        (sr) =>
          sr.name === character.subrace &&
          (!character.subraceSource || (sr.source ?? '') === (character.subraceSource ?? '')),
      )
      if (subraceMatch) subraceIsNested = true
    }

    if (!subraceMatch && character.subrace) {
      const topLevel = allRaces.find(
        (r) =>
          r.name === character.subrace &&
          (!character.subraceSource || (r.source ?? '') === (character.subraceSource ?? '')),
      )
      if (topLevel) subraceMatch = topLevel
    }

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
    allRaces,
  ])
}
