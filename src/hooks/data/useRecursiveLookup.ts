import { useMemo } from 'react'
import { buildRecursiveLookup, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { useFilteredGameData } from './useFilteredGameData'

const EMPTY_RECURSIVE_LOOKUP = buildRecursiveLookup({})
const recursiveLookupCache = new WeakMap<GameData, RecursiveLookup>()
const filteredRecursiveLookupCache = new WeakMap<GameData, Map<string, RecursiveLookup>>()

function getRawRecursiveLookup(gameData: GameData | null): RecursiveLookup {
  if (!gameData) return EMPTY_RECURSIVE_LOOKUP

  const cached = recursiveLookupCache.get(gameData)
  if (cached) return cached

  const lookup = buildRecursiveLookup(gameData)
  recursiveLookupCache.set(gameData, lookup)
  return lookup
}

export function useRecursiveLookup(): RecursiveLookup {
  const filteredGameData = useFilteredGameData()
  const gameData = useGameDataStore((state) => state.gameData)
  const allowedSources = useCharacterStore((state) => state.activeCharacter?.allowedSources)
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  const preferNewerPrintings = useCharacterStore(
    (state) => state.activeCharacter?.variantRules?.preferNewerPrintings ?? false,
  )
  const filterKey = JSON.stringify([
    allowedSources ?? null,
    originSystem ?? null,
    preferNewerPrintings,
  ])

  return useMemo(() => {
    if (!gameData) return EMPTY_RECURSIVE_LOOKUP

    let cacheByFilter = filteredRecursiveLookupCache.get(gameData)
    if (!cacheByFilter) {
      cacheByFilter = new Map()
      filteredRecursiveLookupCache.set(gameData, cacheByFilter)
    }
    const cached = cacheByFilter.get(filterKey)
    if (cached) return cached

    const lookup = buildRecursiveLookup(filteredGameData)
    cacheByFilter.set(filterKey, lookup)
    return lookup
  }, [filteredGameData, filterKey, gameData])
}

export function useRawRecursiveLookup(): RecursiveLookup {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => getRawRecursiveLookup(gameData), [gameData])
}
