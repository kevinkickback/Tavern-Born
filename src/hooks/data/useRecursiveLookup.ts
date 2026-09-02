import { useMemo } from 'react'
import { buildRecursiveLookup, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { useGameDataStore } from '@/store/gameDataStore'

export function useRecursiveLookup(): RecursiveLookup {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => buildRecursiveLookup(gameData ?? {}), [gameData])
}
