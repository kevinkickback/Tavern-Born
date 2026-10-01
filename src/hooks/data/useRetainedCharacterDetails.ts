import { useMemo } from 'react'
import { buildRetainedCharacterDetails } from '@/lib/character/retainedCharacterDetails'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { useCharacterGameDataParams } from './useFilteredGameData'

export function useRetainedCharacterDetails(character: Character, race?: Race5e) {
  const raw = useGameDataStore((state) => state.gameData)
  const primary = useCharacterGameDataParams({
    allowedSources: character.allowedSources,
    originSystem: character.originSystem,
    preferNewerPrintings: character.variantRules?.preferNewerPrintings ?? false,
  })
  return useMemo(
    () => buildRetainedCharacterDetails(character, primary, raw, race),
    [character, primary, raw, race],
  )
}
