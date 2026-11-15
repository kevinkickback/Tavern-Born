import { useMemo } from 'react'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { useItemPropertyLookup } from '@/hooks/data/useGameData'
import { getCatalogCharacterReadiness } from '@/lib/readiness/catalogCharacterReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

export function useCharacterReadiness(character: Character | null | undefined) {
  const filtered = useCharacterGameDataParams({
    allowedSources: character?.allowedSources,
    originSystem: character?.originSystem,
    preferNewerPrintings: character?.variantRules?.preferNewerPrintings,
  })
  const raw = useGameDataStore((state) => state.gameData)
  const itemProperties = useItemPropertyLookup()
  return useMemo(
    () =>
      character ? getCatalogCharacterReadiness(character, filtered, raw, itemProperties) : null,
    [character, filtered, raw, itemProperties],
  )
}
