import { useMemo } from 'react'
import { buildRecursiveLookup, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData } from '@/types/5etools'

const EMPTY_RECURSIVE_LOOKUP = buildRecursiveLookup({})
const recursiveLookupCache = new WeakMap<GameData, RecursiveLookup>()

function getRecursiveLookup(gameData: GameData | null): RecursiveLookup {
  if (!gameData) return EMPTY_RECURSIVE_LOOKUP

  const cached = recursiveLookupCache.get(gameData)
  if (cached) return cached

  const lookup = buildRecursiveLookup(gameData)
  recursiveLookupCache.set(gameData, lookup)
  return lookup
}

export function useRecursiveLookup(): RecursiveLookup {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => getRecursiveLookup(gameData), [gameData])
}
