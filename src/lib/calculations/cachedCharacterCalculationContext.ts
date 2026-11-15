import type { EntityLookupSet } from '@/lib/5etools/entityResolvers'
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
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'

// Character and filtered-data identity change when their inputs change in the stores.
const calculationCache = new WeakMap<
  Character,
  WeakMap<object, { rawLookups: unknown; result: CharacterCalculationContext }>
>()
const primaryLookupCache = new WeakMap<GameData, EntityLookupSet>()

function getPrimaryLookups(data: GameData): EntityLookupSet {
  const cached = primaryLookupCache.get(data)
  if (cached) return cached
  const startingEquipmentItems = [...data.items, ...data.itemsBase]
  const lookups = {
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
    backgroundsByKey: buildBackgroundLookup(data.backgrounds ?? []),
    classesByKey: buildClassLookup(data.classes ?? []),
    featsByKey: buildFeatLookup(data.feats ?? []),
    featExpertiseFeats: data.feats,
    itemLookup: buildItemLookup(startingEquipmentItems),
    startingEquipmentItems,
    racesByKey: buildRaceLookup(data.races ?? []),
    spellsByKey: buildSpellLookup(data.spells ?? []),
  }
  primaryLookupCache.set(data, lookups)
  return lookups
}

export function getCachedCharacterCalculationContext(
  character: Character,
  filteredData: GameData,
  rawLookupSet: GameData['lookups'],
): CharacterCalculationContext {
  const cached = calculationCache.get(character)?.get(filteredData)
  if (cached && cached.rawLookups === rawLookupSet) return cached.result

  const primaryLookups = {
    ...getPrimaryLookups(filteredData),
    itemTypeByAbbr: rawLookupSet?.itemTypeByAbbr,
  }
  const rawLookups = {
    backgroundsByKey: rawLookupSet?.backgroundsByKey ?? {},
    classesByKey: rawLookupSet?.classesByKey ?? {},
    featsByKey: rawLookupSet?.featsByKey ?? {},
    itemLookup: rawLookupSet?.itemLookup,
    startingEquipmentItems: rawLookupSet?.startingEquipmentItems,
    itemTypeByAbbr: rawLookupSet?.itemTypeByAbbr,
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
}
