import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'

/** Qualified feature targets share one complete character-filtered catalog boundary. */
export function useClassChoiceFeatureCatalogs() {
  const {
    legacySubclassChoices,
    psionics,
    classes,
    creatures,
    classFeatures,
    skills,
    languages,
    items,
    itemsBase,
    itemProperties,
    itemTypes,
    feats,
    optionalfeatures,
    optionalClassFeatureSources,
    optionalClassSections,
    classCastingSources,
  } = useFilteredGameData()
  return useMemo(
    () =>
      buildClassChoiceFeatureCatalogs({
        legacySubclassChoices,
        psionics,
        classes,
        creatures,
        classFeatures,
        skills,
        languages,
        items,
        itemsBase,
        itemProperties,
        itemTypes,
        feats,
        optionalfeatures,
        optionalClassFeatureSources,
        optionalClassSections,
        classCastingSources,
      }),
    [
      legacySubclassChoices,
      psionics,
      classes,
      creatures,
      classFeatures,
      skills,
      languages,
      items,
      itemsBase,
      itemProperties,
      itemTypes,
      feats,
      optionalfeatures,
      optionalClassFeatureSources,
      optionalClassSections,
      classCastingSources,
    ],
  )
}
