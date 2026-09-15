import { useMemo } from 'react'
import { deriveCharacterActions } from '@/lib/calculations/actions'
import { getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'
import { useCharacterCalculationContext } from './useCharacterCalculationContext'

export function useCharacterActions(character: Character | null | undefined) {
  const calculation = useCharacterCalculationContext(character)
  const lookups = useGameDataStore((state) => state.gameData?.lookups)

  return useMemo(() => {
    if (!character || !calculation) return []
    return deriveCharacterActions(character, {
      abilityModifiers: calculation.abilityScores.modifiers,
      proficiencyBonus: getProficiencyBonus(getTotalCharacterLevel(character)),
      itemLookup: lookups?.itemLookup,
      propertyLookup: lookups?.itemPropertyByAbbr,
      effects: calculation.effects.declarations,
      effectContext: calculation.effects.resolutionContext,
      spellsByKey: lookups?.spellsByKey,
      race: calculation.raceResolution.mergedRace,
    })
  }, [calculation, character, lookups])
}
