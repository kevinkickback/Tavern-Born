import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useItemPropertyLookup, useItemTypeLookup } from '@/hooks/data/useGameData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import {
  type ClassChoiceCatalogs,
  collectSubclassFeatures,
} from '@/lib/character/classChoiceOptions'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Creature5e, OptionalFeatureLike } from '@/types/5etools'
import type { Character } from '@/types/character'
import { useCharacterCalculationContext } from './useCharacterCalculationContext'

const EMPTY_WEAPON_PROFICIENCIES: readonly string[] = []

export function useCharacterReadiness(character: Character | null | undefined) {
  const calculation = useCharacterCalculationContext(character)
  const {
    classFeatures,
    classes,
    creatures,
    feats: filteredFeats,
    itemMasteries,
    items,
    itemsBase,
    optionalfeatures,
  } = useFilteredGameData()
  const itemTypeByAbbr = useItemTypeLookup()
  const itemPropertyByAbbr = useItemPropertyLookup()
  const feats = useGameDataStore((state) => state.gameData?.feats)
  const spellsByKey = useGameDataStore((state) => state.gameData?.lookups?.spellsByKey)
  const featsByKey = useMemo(
    () =>
      Object.fromEntries(
        (feats ?? []).map((feat) => [getEntityLookupKey(feat.name, feat.source), feat]),
      ),
    [feats],
  )
  const classChoiceCatalogs = useMemo<ClassChoiceCatalogs>(
    () => ({
      classFeatures,
      subclassFeatures: classes.flatMap((classData) =>
        (classData.subclasses ?? []).flatMap(collectSubclassFeatures),
      ),
      creatures: creatures as Creature5e[],
      feats: filteredFeats,
      items,
      itemsBase,
      itemMasteries,
      optionalFeatures: optionalfeatures as OptionalFeatureLike[],
      itemPropertyByAbbr,
      itemTypeByAbbr,
      weaponProficiencies: character?.proficiencies.weapons ?? EMPTY_WEAPON_PROFICIENCIES,
    }),
    [
      character?.proficiencies.weapons,
      classFeatures,
      classes,
      creatures,
      filteredFeats,
      itemMasteries,
      itemPropertyByAbbr,
      itemTypeByAbbr,
      items,
      itemsBase,
      optionalfeatures,
    ],
  )

  return useMemo(
    () =>
      character
        ? getCharacterReadiness(character, {
            calculation,
            classChoiceCatalogs,
            featsByKey,
            spellsByKey,
          })
        : null,
    [calculation, character, classChoiceCatalogs, featsByKey, spellsByKey],
  )
}
