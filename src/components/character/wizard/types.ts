import type { AbilityScoreMethod } from '@/lib/calculations/abilityScoreMethods'
import type { AbilityScores, OriginSystem, PortraitTransform } from '@/types/character'

export type WizardStepId =
  | 'basics'
  | 'rules'
  | 'content'
  | 'race'
  | 'class'
  | 'background'
  | 'abilities'
  | 'review'

export interface WizardStep {
  id: WizardStepId
  label: string
  title: string
  section: string
  description: string
  icon: React.ElementType
}

export interface CharacterWizardData {
  name: string
  age: number | null
  gender: string
  height: string
  weight: string
  eyes: string
  hair: string
  race: string
  raceSource: string
  subrace: string
  subraceSource: string
  class: string
  classSource: string
  background: string
  backgroundSource: string
  originSystem: OriginSystem
  abilityScoreMethod: AbilityScoreMethod
  abilityScores: AbilityScores
  portrait: string
  portraitTransform: PortraitTransform
  allowedSources: string[]
  raceAsiChoices: string[][]
  raceAsiBlockIndex: 0 | 1
  backgroundAsi?: { blockIndex: number; choices: string[] }
  variantRules: {
    optionalClassFeatures: boolean
    averageHitPoints: boolean
    anyRaceSubclasses: boolean
    preferNewerPrintings: boolean
  }
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface StepProps {
  data: CharacterWizardData
  onChange: (updates: Partial<CharacterWizardData>) => void
}
