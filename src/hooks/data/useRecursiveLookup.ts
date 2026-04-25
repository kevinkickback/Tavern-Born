import { useMemo } from 'react'
import {
  buildNameMap,
  type RecursiveLookup,
  type TooltipEntityLike,
} from '@/pages/spells/components/spellTooltipUtils'
import { useGameDataStore } from '@/store/gameDataStore'

export function useRecursiveLookup(): RecursiveLookup {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(
    () => ({
      spells: buildNameMap(gameData?.spells ?? []),
      items: buildNameMap(gameData?.items ?? []),
      feats: buildNameMap(gameData?.feats ?? []),
      races: buildNameMap(gameData?.races ?? []),
      classes: buildNameMap(gameData?.classes ?? []),
      backgrounds: buildNameMap(gameData?.backgrounds ?? []),
      optionalfeatures: buildNameMap((gameData?.optionalfeatures ?? []) as TooltipEntityLike[]),
      actions: buildNameMap((gameData?.actions ?? []) as TooltipEntityLike[]),
      conditions: buildNameMap((gameData?.conditions ?? []) as TooltipEntityLike[]),
      deities: buildNameMap((gameData?.deities ?? []) as TooltipEntityLike[]),
      skills: buildNameMap((gameData?.skills ?? []) as TooltipEntityLike[]),
      senses: buildNameMap((gameData?.senses ?? []) as TooltipEntityLike[]),
      variantrules: buildNameMap((gameData?.variantrules ?? []) as TooltipEntityLike[]),
      languages: buildNameMap(gameData?.languages ?? []),
    }),
    [gameData],
  )
}
