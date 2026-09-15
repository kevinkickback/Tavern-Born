import { useMemo } from 'react'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'
import { useCharacterCalculationContext } from './useCharacterCalculationContext'

export function useCharacterReadiness(character: Character | null | undefined) {
  const calculation = useCharacterCalculationContext(character)
  const feats = useGameDataStore((state) => state.gameData?.feats)
  const spellsByKey = useGameDataStore((state) => state.gameData?.lookups?.spellsByKey)
  const featsByKey = useMemo(
    () =>
      Object.fromEntries(
        (feats ?? []).map((feat) => [getEntityLookupKey(feat.name, feat.source), feat]),
      ),
    [feats],
  )

  return useMemo(
    () =>
      character ? getCharacterReadiness(character, { calculation, featsByKey, spellsByKey }) : null,
    [calculation, character, featsByKey, spellsByKey],
  )
}
