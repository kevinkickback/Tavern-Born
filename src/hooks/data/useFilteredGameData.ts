import { useMemo } from 'react'
import { useStore } from 'zustand'
import { type FilterParams, filterGameData } from '@/lib/5etools/filterGameData'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { useCharacterEditingStore } from '@/store/characterEditingContext'
import { useGameDataStore } from '@/store/gameDataStore'

/** Filter by explicit source parameters without depending on the active character. */
export function useFilteredGameDataParams({
  allowedSources,
  preferNewerPrintings,
  originSystem,
}: FilterParams) {
  const gameData = useGameDataStore((state) => state.gameData)
  return useMemo(
    () => filterGameData(gameData, { allowedSources, preferNewerPrintings, originSystem }),
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
  const store = useCharacterEditingStore()
  const allowedSources = useStore(store, (state) => state.activeCharacter?.allowedSources)
  const originSystem = useStore(store, (state) => state.activeCharacter?.originSystem)
  const preferNewerPrintings = useStore(
    store,
    (state) => state.activeCharacter?.variantRules?.preferNewerPrintings ?? false,
  )
  return useCharacterGameDataParams({ allowedSources, originSystem, preferNewerPrintings })
}
