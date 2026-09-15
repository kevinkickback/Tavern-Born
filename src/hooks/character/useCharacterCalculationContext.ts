import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildBackgroundLookup, buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import {
  type CharacterCalculationContext,
  createCharacterCalculationContext,
} from '@/lib/calculations/characterCalculationContext'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

export function useCharacterCalculationContext(
  character: Character | null | undefined,
): CharacterCalculationContext | null {
  const { backgrounds = [], classes = [], races = [] } = useFilteredGameData()
  const rawLookupSet = useGameDataStore((state) => state.gameData?.lookups)

  const primaryLookups = useMemo(
    () => ({
      backgroundsByKey: buildBackgroundLookup(backgrounds),
      classesByKey: buildClassLookup(classes),
      racesByKey: buildRaceLookup(races),
    }),
    [backgrounds, classes, races],
  )
  const rawLookups = useMemo(
    () => ({
      backgroundsByKey: rawLookupSet?.backgroundsByKey ?? {},
      classesByKey: rawLookupSet?.classesByKey ?? {},
      racesByKey: rawLookupSet?.racesByKey ?? {},
    }),
    [rawLookupSet],
  )

  return useMemo(
    () =>
      character ? createCharacterCalculationContext(character, primaryLookups, rawLookups) : null,
    [character, primaryLookups, rawLookups],
  )
}
