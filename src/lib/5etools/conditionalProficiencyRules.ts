import type { AbilityName } from '@/types/character'
import generated from './conditionalProficiencyRules.generated.json' with { type: 'json' }

export interface ConditionalProficiencyRule {
  family: 'fire-rune' | 'dragon-ancestor' | 'favored-terrain'
  target: string
  name: string
  proficiencyType: 'tool' | 'skill' | 'any'
  abilities?: AbilityName[]
  note: string
  className: string
  classSource: string
  level: number
  optionalTarget?: string
  progressionOwner?: { shortName: string; source: string }
  progression?: {
    name: string
    featureType: string[]
    progression: Record<string, number>
  }
}
export interface ConditionalOptionalCertificate {
  target: string
  digest: string
  fields: string[]
}
export const CONDITIONAL_PROFICIENCY_RULES = generated.features as ConditionalProficiencyRule[]
export const CONDITIONAL_OPTIONAL_CERTIFICATES =
  generated.optional as ConditionalOptionalCertificate[]
