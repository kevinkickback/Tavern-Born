import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { getCachedCharacterCalculationContext } from '@/lib/calculations/cachedCharacterCalculationContext'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

export function useCharacterCalculationContext(character: Character | null | undefined) {
  const filteredData = useFilteredGameData()
  const rawLookups = useGameDataStore((state) => state.gameData?.lookups)

  return useMemo(
    () =>
      character ? getCachedCharacterCalculationContext(character, filteredData, rawLookups) : null,
    [character, filteredData, rawLookups],
  )
}
