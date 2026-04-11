import { getOptFeatureTotal } from '@/lib/5etools/classData'
import type { ClassFeatureDisplay } from '../components/DetailsPanel'

export interface OptionalFeatureProgression {
  name?: string
  featureType: string[]
  progression: number[] | Record<string, number>
}

export interface ClassFeatProgression {
  name?: string
  category: string[]
  progression: number[] | Record<string, number>
}

interface SpellGain {
  cantrips: number
  spells: number
  maxSpellLevel: number
}

interface ComputeLevelDisplayDataParams {
  level: number
  subclassLevel: number
  subclassFeatureName: string | null
  asiLevels: number[]
  spellChoicesByLevel: Map<number, SpellGain>
  optFeatureProgressions: OptionalFeatureProgression[]
  classFeatProgressions: ClassFeatProgression[]
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
}

export function computeLevelDisplayData({
  level,
  subclassLevel,
  subclassFeatureName,
  asiLevels,
  spellChoicesByLevel,
  optFeatureProgressions,
  classFeatProgressions,
  featuresByLevel,
}: ComputeLevelDisplayDataParams): {
  isSubclassLevel: boolean
  isASILevel: boolean
  spellGain: SpellGain | undefined
  optFeatureGainsAtLevel: OptionalFeatureProgression[]
  classFeatGainsAtLevel: ClassFeatProgression[]
  passiveFeatures: ClassFeatureDisplay[]
  choiceCount: number
  totalCount: number
} {
  const isSubclassLevel = level === subclassLevel
  const isASILevel = asiLevels.includes(level)
  const spellGain = spellChoicesByLevel.get(level)

  const optFeatureGainsAtLevel = optFeatureProgressions.filter(
    (progression) =>
      getOptFeatureTotal(progression.progression, level) >
      getOptFeatureTotal(progression.progression, level - 1),
  )

  const classFeatGainsAtLevel = classFeatProgressions.filter(
    (progression) =>
      getOptFeatureTotal(progression.progression, level) >
      getOptFeatureTotal(progression.progression, level - 1),
  )

  const passiveFeatures = (featuresByLevel.get(level) ?? []).filter((feature) => {
    if (isSubclassLevel && subclassFeatureName && feature.name === subclassFeatureName) {
      return false
    }
    if (isASILevel && feature.name === 'Ability Score Improvement') {
      return false
    }
    if (
      classFeatGainsAtLevel.some(
        (progression) => progression.name && progression.name === feature.name,
      )
    ) {
      return false
    }
    return true
  })

  const choiceCount =
    (isSubclassLevel ? 1 : 0) +
    (isASILevel ? 1 : 0) +
    (spellGain ? 1 : 0) +
    optFeatureGainsAtLevel.length +
    classFeatGainsAtLevel.length

  return {
    isSubclassLevel,
    isASILevel,
    spellGain,
    optFeatureGainsAtLevel,
    classFeatGainsAtLevel,
    passiveFeatures,
    choiceCount,
    totalCount: passiveFeatures.length + choiceCount,
  }
}
