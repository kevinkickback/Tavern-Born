import { useMemo } from 'react'
import { buildRecursiveLookup, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'
import { useFilteredGameData } from './useFilteredGameData'

const EMPTY_RECURSIVE_LOOKUP = buildRecursiveLookup({})
const recursiveLookupCache = new WeakMap<GameData, RecursiveLookup>()

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

  return useMemo(() => buildRecursiveLookup(filteredGameData), [filteredGameData])
}

export function useRawRecursiveLookup(): RecursiveLookup {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => getRawRecursiveLookup(gameData), [gameData])
}
