import { useMemo, useState } from 'react'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useOptionalFeatureLookup } from '@/hooks/data/useGameData'
import type { OptionalFeatureLike } from '@/lib/5etools/classData'
import { getFeatureTypes } from '@/lib/5etools/classData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import type { OptionalFeatureProgression } from '@/pages/build/class/model/levelsUtils'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export interface OptionalFeaturePickerState {
  progName: string
  featureTypes: string[]
  total: number
}

interface ClassOptionalFeatureControllerParams {
  character: Character | null
  viewingClass?: string
  viewingClassData?: Class5e
  optionalFeatures: unknown[]
  includeClassFeatureVariants: boolean
}

function isOptionalFeatureLike(value: unknown): value is OptionalFeatureLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string'
  )
}

export function useClassOptionalFeatureController({
  character,
  viewingClass,
  viewingClassData,
  optionalFeatures,
  includeClassFeatureVariants,
}: ClassOptionalFeatureControllerParams) {
  const [pickerState, setPickerState] = useState<OptionalFeaturePickerState | null>(null)
  const optionalFeatureLookup = useOptionalFeatureLookup()
  const { replaceOptionalFeatureSelections } = useFeatProvenanceMutations()
  const features = useMemo(
    () =>
      (optionalFeatures as Array<OptionalFeatureLike & { isClassFeatureVariant?: boolean }>).filter(
        (feature) => includeClassFeatureVariants || !feature.isClassFeatureVariant,
      ),
    [optionalFeatures, includeClassFeatureVariants],
  )
  const progressions = useMemo(
    () => (viewingClassData?.optionalfeatureProgression ?? []) as OptionalFeatureProgression[],
    [viewingClassData],
  )

  const findFeature = (name: string, source?: string): OptionalFeatureLike | undefined => {
    const fromLookup = optionalFeatureLookup[getEntityLookupKey(name, source)]
    if (isOptionalFeatureLike(fromLookup)) return fromLookup
    return features.find(
      (feature) => feature.name === name && (source === undefined || feature.source === source),
    )
  }

  const confirm = (names: string[], featureTypes: string[]) => {
    if (!character || !viewingClass) return
    const replacedFeatures = character.features
      .filter((feature) => {
        const optionalFeature = findFeature(feature.name, feature.source)
        return (
          optionalFeature &&
          featureTypes.some((featureType) => getFeatureTypes(optionalFeature).includes(featureType))
        )
      })
      .map((feature) => ({ name: feature.name, source: feature.source }))
    const selectedFeatures = names.map((name) => {
      const feature = findFeature(name)
      return { name, source: feature?.source }
    })
    replaceOptionalFeatureSelections(replacedFeatures, selectedFeatures, viewingClass, 'class')
  }

  return {
    features,
    progressions,
    selectedNames: new Set((character?.features ?? []).map((feature) => feature.name)),
    pickerState,
    setPickerState,
    confirm,
  }
}
