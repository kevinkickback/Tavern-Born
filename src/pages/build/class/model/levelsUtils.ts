import type { ClassFeatureDisplay } from '../components/DetailsPanel'

interface SpellGain {
  cantrips: number
  spells: number
  maxSpellLevel: number
  canSwap: boolean
}

interface ComputeLevelDisplayDataParams {
  level: number
  subclassLevel: number
  subclassFeatureName: string | null
  asiLevels: number[]
  spellChoicesByLevel: Map<number, SpellGain>
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
}

export function computeLevelDisplayData({
  level,
  subclassLevel,
  subclassFeatureName,
  asiLevels,
  spellChoicesByLevel,
  featuresByLevel,
}: ComputeLevelDisplayDataParams): {
  isSubclassLevel: boolean
  isASILevel: boolean
  spellGain: SpellGain | undefined
  passiveFeatures: ClassFeatureDisplay[]
  choiceCount: number
  totalCount: number
} {
  const isSubclassLevel = level === subclassLevel
  const isASILevel = asiLevels.includes(level)
  const spellGain = spellChoicesByLevel.get(level)

  const passiveFeatures = (featuresByLevel.get(level) ?? []).filter((feature) => {
    if (isSubclassLevel && subclassFeatureName && feature.name === subclassFeatureName) {
      return false
    }
    if (isASILevel && feature.name === 'Ability Score Improvement') {
      return false
    }
    return true
  })

  const choiceCount = (isSubclassLevel ? 1 : 0) + (isASILevel ? 1 : 0) + (spellGain ? 1 : 0)

  return {
    isSubclassLevel,
    isASILevel,
    spellGain,
    passiveFeatures,
    choiceCount,
    totalCount: passiveFeatures.length + choiceCount,
  }
}
