export type NormalizedCharacterChoiceKind = 'class-feature' | 'feat' | 'item' | 'optional-feature'

export type ChoiceOptionEntityType = 'classFeature' | 'feat' | 'item' | 'optionalFeature'

export interface NormalizedChoiceOptionReference {
  entityType: ChoiceOptionEntityType
  name: string
  source?: string
}

export interface NormalizedChoiceOptionFilter {
  entityType: ChoiceOptionEntityType
  categories?: string[]
  featureTypes?: string[]
  itemTypes?: string[]
  weaponRanges?: Array<'melee' | 'ranged'>
  source?: string
  requiresProficiency?: boolean
  requiresMastery?: boolean
}

export interface NormalizedCharacterChoice {
  id: string
  label: string
  kind: NormalizedCharacterChoiceKind
  owner: {
    type: 'class'
    name: string
    source: string
    featureName?: string
    featureSource?: string
  }
  level: number
  minimumSelections: number
  maximumSelections: number
  selectionCountByLevel: readonly number[]
  options: NormalizedChoiceOptionReference[]
  optionFilter?: NormalizedChoiceOptionFilter
  repeatable: boolean
  replacement: {
    cadence: 'never' | 'class-level' | 'asi-level' | 'long-rest'
    maximumPerEvent?: number | 'all'
  }
  source: {
    kind: 'class-feature-options' | 'class-table' | 'optional-feature-progression'
    field: string
  }
}

export interface ClassChoiceDiagnostic {
  code: 'invalid-count' | 'unresolved-options'
  className: string
  classSource: string
  featureName: string
  level?: number
  message: string
}

type ClassResourceMaxFormula = 'cha-mod'
type ClassResourceRecoveryAmount = number | 'all'

export interface ClassResourceRecovery {
  shortRest?: ClassResourceRecoveryAmount
  longRest?: ClassResourceRecoveryAmount
}

export interface ClassResourceDef {
  id: string
  label: string
  maxPerLevel: readonly number[]
  restType: 'short' | 'long'
  restTypeByLevel?: readonly ('short' | 'long')[]
  recovery?: ClassResourceRecovery
  recoveryByLevel?: readonly ClassResourceRecovery[]
  maxFormula?: ClassResourceMaxFormula
}

export interface NormalizedClassRules {
  resources: ClassResourceDef[]
  asiLevels: number[]
  ritualCasting: boolean
  choices: NormalizedCharacterChoice[]
  choiceDiagnostics: ClassChoiceDiagnostic[]
}
