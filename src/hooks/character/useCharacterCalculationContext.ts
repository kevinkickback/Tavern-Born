import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  buildBackgroundLookup,
  buildClassLookup,
  buildFeatLookup,
  buildRaceLookup,
} from '@/lib/5etools/lookups'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  type CharacterCalculationContext,
  createCharacterCalculationContext,
} from '@/lib/calculations/characterCalculationContext'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

// Character and filtered-data identity change when their inputs change in the stores.
const calculationCache = new WeakMap<
  Character,
  WeakMap<object, { rawLookups: unknown; result: CharacterCalculationContext }>
>()

export function useCharacterCalculationContext(
  character: Character | null | undefined,
): CharacterCalculationContext | null {
  const filteredData = useFilteredGameData()
  const rawLookupSet = useGameDataStore((state) => state.gameData?.lookups)

  return useMemo(() => {
    if (!character) return null
    const cached = calculationCache.get(character)?.get(filteredData)
    if (cached && cached.rawLookups === rawLookupSet) return cached.result

    const primaryLookups = {
      backgroundsByKey: buildBackgroundLookup(filteredData.backgrounds ?? []),
      classesByKey: buildClassLookup(filteredData.classes ?? []),
      featsByKey: buildFeatLookup(filteredData.feats ?? []),
      itemLookup: buildItemLookup([
        ...(filteredData.items ?? []),
        ...(filteredData.itemsBase ?? []),
      ]),
      racesByKey: buildRaceLookup(filteredData.races ?? []),
    }
    const rawLookups = {
      backgroundsByKey: rawLookupSet?.backgroundsByKey ?? {},
      classesByKey: rawLookupSet?.classesByKey ?? {},
      featsByKey: rawLookupSet?.featsByKey ?? {},
      itemLookup: rawLookupSet?.itemLookup,
      racesByKey: rawLookupSet?.racesByKey ?? {},
    }
    const result = createCharacterCalculationContext(character, primaryLookups, rawLookups)
    let byData = calculationCache.get(character)
    if (!byData) {
      byData = new WeakMap()
      calculationCache.set(character, byData)
    }
    byData.set(filteredData, { rawLookups: rawLookupSet, result })
    return result
  }, [character, filteredData, rawLookupSet])
}
