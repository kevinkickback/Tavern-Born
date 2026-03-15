export interface WizardStep {
  id: number
  label: string
  icon: React.ElementType
}

export interface CharacterWizardData {
  name: string
  gender: string
  race: string
  subrace: string
  class: string
  background: string
  abilityScoreMethod: string
  portrait: string
  rulesMode: string
  allowedSources: string[]
  variantRules: {
    optionalClassFeatures: boolean
    averageHitPoints: boolean
  }
}

export interface ValidationResult {
  valid: boolean
  error?: string
  fields?: string[]
}

export interface StepProps {
  data: CharacterWizardData
  onChange: (updates: Partial<CharacterWizardData>) => void
  invalidFields?: Set<string>
}
