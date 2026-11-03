import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'

/** Qualified feature targets share one complete character-filtered catalog boundary. */
export function useClassChoiceFeatureCatalogs() {
  const {
    psionics,
    classes,
    classFeatures,
    skills,
    languages,
    items,
    itemsBase,
    feats,
    optionalfeatures,
    optionalClassFeatureSources,
    optionalClassSections,
    classCastingSources,
  } = useFilteredGameData()
  return useMemo(
    () =>
      buildClassChoiceFeatureCatalogs({
        psionics,
        classes,
        classFeatures,
        skills,
        languages,
        items,
        itemsBase,
        feats,
        optionalfeatures,
        optionalClassFeatureSources,
        optionalClassSections,
        classCastingSources,
      }),
    [
      psionics,
      classes,
      classFeatures,
      skills,
      languages,
      items,
      itemsBase,
      feats,
      optionalfeatures,
      optionalClassFeatureSources,
      optionalClassSections,
      classCastingSources,
    ],
  )
}
