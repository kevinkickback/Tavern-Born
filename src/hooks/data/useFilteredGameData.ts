import { useMemo } from 'react'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { type FilterParams, filterGameData } from '@/lib/5etools/filterGameData'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

/**
 * Core game data filtering hook. Accepts explicit filter parameters so callers
 * without an active character (settings pages, compendium) can pass their own
 * source lists without coupling to `characterStore`.
 */
export function useFilteredGameDataParams(params: FilterParams) {
  const gameData = useGameDataStore((state) => state.gameData)
  const { allowedSources, preferNewerPrintings = false, originSystem } = params

  const filteredData = useMemo(() => {
    if (!gameData) return createEmptyGameData()

    return filterGameData(gameData, { allowedSources, preferNewerPrintings, originSystem })
  }, [gameData, allowedSources, preferNewerPrintings, originSystem])

  return filteredData
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
