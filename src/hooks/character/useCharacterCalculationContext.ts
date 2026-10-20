import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  buildBackgroundLookup,
  buildClassLookup,
  buildFeatLookup,
  buildRaceLookup,
  buildSpellLookup,
} from '@/lib/5etools/lookups'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  type CharacterCalculationContext,
  createCharacterCalculationContext,
} from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

// Character and filtered-data identity change when their inputs change in the stores.
const calculationCache = new WeakMap<
  Character,
  WeakMap<object, { rawLookups: unknown; result: CharacterCalculationContext }>
>()
const featureCatalogCache = new WeakMap<
  object,
  ReturnType<typeof buildClassChoiceFeatureCatalogs>
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

    let featureCatalogs = featureCatalogCache.get(filteredData)
    if (!featureCatalogs) {
      featureCatalogs = buildClassChoiceFeatureCatalogs(filteredData)
      featureCatalogCache.set(filteredData, featureCatalogs)
    }
    const primaryLookups = {
      classChoiceClasses: filteredData.classes,
      classChoiceFeatureCatalogs: featureCatalogs,
      backgroundsByKey: buildBackgroundLookup(filteredData.backgrounds ?? []),
      classesByKey: buildClassLookup(filteredData.classes ?? []),
      featsByKey: buildFeatLookup(filteredData.feats ?? []),
      featExpertiseFeats: filteredData.feats,
      itemLookup: buildItemLookup([
        ...(filteredData.items ?? []),
        ...(filteredData.itemsBase ?? []),
      ]),
      racesByKey: buildRaceLookup(filteredData.races ?? []),
      spellsByKey: buildSpellLookup(filteredData.spells ?? []),
    }
    const rawLookups = {
      backgroundsByKey: rawLookupSet?.backgroundsByKey ?? {},
      classesByKey: rawLookupSet?.classesByKey ?? {},
      featsByKey: rawLookupSet?.featsByKey ?? {},
      itemLookup: rawLookupSet?.itemLookup,
      racesByKey: rawLookupSet?.racesByKey ?? {},
      spellsByKey: rawLookupSet?.spellsByKey ?? {},
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
