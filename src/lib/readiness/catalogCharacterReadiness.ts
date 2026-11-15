import type { FilteredGameData } from '@/lib/5etools/filteredGameData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getCachedCharacterCalculationContext } from '@/lib/calculations/cachedCharacterCalculationContext'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  type ClassChoiceCatalogs,
  createClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import type { Feat5e, GameData, OptionalFeatureLike } from '@/types/5etools'
import type { Character } from '@/types/character'
import { type CharacterReadinessResult, getCharacterReadiness } from './characterReadiness'

const featLookups = new WeakMap<GameData['feats'], Record<string, Feat5e>>()
const emptyFeats: Readonly<Record<string, Feat5e>> = {}
const readinessByCalculation = new WeakMap<
  CharacterCalculationContext,
  {
    raw: GameData | null
    itemPropertyByAbbr: Readonly<Record<string, string>>
    result: CharacterReadinessResult
  }
>()

function getFeatLookup(feats: GameData['feats'] | undefined) {
  if (!feats) return emptyFeats
  const cached = featLookups.get(feats)
  if (cached) return cached
  const lookup = Object.fromEntries(
    feats.map((feat) => [getEntityLookupKey(feat.name, feat.source), feat]),
  )
  featLookups.set(feats, lookup)
  return lookup
}

export function getCatalogCharacterReadiness(
  character: Character,
  filtered: FilteredGameData,
  raw: GameData | null,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
) {
  const calculation = getCachedCharacterCalculationContext(character, filtered, raw?.lookups)
  const cached = readinessByCalculation.get(calculation)
  if (cached && cached.raw === raw && cached.itemPropertyByAbbr === itemPropertyByAbbr)
    return cached.result
  const classChoiceCatalogs: ClassChoiceCatalogs = {
    ...createClassChoiceCatalogs(calculation.lookups.primary.classChoiceFeatureCatalogs),
    creatures: filtered.creatures,
    feats: filtered.feats,
    items: filtered.items,
    itemsBase: filtered.itemsBase,
    itemMasteries: filtered.itemMasteries,
    optionalFeatures: filtered.optionalfeatures as OptionalFeatureLike[],
    itemPropertyByAbbr,
    itemTypeByAbbr: raw?.lookups?.itemTypeByAbbr ?? {},
    weaponProficiencies: character.proficiencies.weapons ?? [],
  }
  const result = getCharacterReadiness(character, {
    calculation,
    classChoiceCatalogs,
    featsByKey: getFeatLookup(raw?.feats),
    spellsByKey: raw?.lookups?.spellsByKey,
  })
  readinessByCalculation.set(calculation, { raw, itemPropertyByAbbr, result })
  return result
}
