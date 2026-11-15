import { useMemo } from 'react'
import { type FilterParams, getFilteredGameData } from '@/lib/5etools/filteredGameData'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

/** Filter by explicit source parameters without depending on the active character. */
export function useFilteredGameDataParams({
  allowedSources,
  preferNewerPrintings,
  originSystem,
}: FilterParams) {
  const gameData = useGameDataStore((state) => state.gameData)
  return useMemo(
    () => getFilteredGameData(gameData, { allowedSources, preferNewerPrintings, originSystem }),
    [gameData, allowedSources, preferNewerPrintings, originSystem],
  )
}

/** Explicit character filters include the implicit core source. */
export function useCharacterGameDataParams({
  allowedSources,
  originSystem = '2014',
  preferNewerPrintings,
}: FilterParams) {
  const effectiveSources = useMemo(() => {
    if (!allowedSources) return undefined
    return getEffectiveSources(allowedSources, originSystem)
  }, [allowedSources, originSystem])

  return useFilteredGameDataParams({
    allowedSources: effectiveSources,
    preferNewerPrintings,
    originSystem,
  })
}

/** Game data filtered by the active character's source settings. */
export function useFilteredGameData() {
  const allowedSources = useCharacterStore((state) => state.activeCharacter?.allowedSources)
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  const preferNewerPrintings = useCharacterStore(
    (state) => state.activeCharacter?.variantRules?.preferNewerPrintings ?? false,
  )
  return useCharacterGameDataParams({ allowedSources, originSystem, preferNewerPrintings })
}
