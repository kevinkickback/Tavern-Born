import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'

/** Qualified feature targets share one complete character-filtered catalog boundary. */
export function useClassChoiceFeatureCatalogs() {
  const { classes, classFeatures } = useFilteredGameData()
  return useMemo(
    () => buildClassChoiceFeatureCatalogs({ classes, classFeatures }),
    [classes, classFeatures],
  )
}
