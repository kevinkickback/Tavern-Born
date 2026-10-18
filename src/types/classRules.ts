export type NormalizedCharacterChoiceKind =
  | 'class-feature'
  | 'subclass-feature'
  | 'feat'
  | 'item'
  | 'optional-feature'
  | 'creature'
  | 'feature-option'

export type ChoiceOptionEntityType =
  | 'classFeature'
  | 'subclassFeature'
  | 'feat'
  | 'item'
  | 'optionalFeature'
  | 'creature'
  | 'featureOption'

export interface NormalizedChoiceOptionReference {
  entityType: ChoiceOptionEntityType
  name: string
  source?: string
  /** Complete 5etools UID for class/subclass feature options, including gain and printing. */
  ref?: string
  minimumClassLevel?: number
}

export interface NormalizedChoiceOptionFilter {
  entityType: ChoiceOptionEntityType
  categories?: string[]
  featureTypes?: string[]
  itemTypes?: string[]
  excludedItemTypes?: string[]
  excludedItemProperties?: string[]
  rarities?: string[]
  creatureTypes?: string[]
  sizes?: string[]
  challengeRatingMaximum?: number
  excludeSwarms?: boolean
  excludeCursed?: boolean
  weaponRanges?: Array<'melee' | 'ranged'>
  source?: string
  requiresProficiency?: boolean
  requiresMastery?: boolean
  minimumClassLevel?: number
  anyOf?: NormalizedChoiceOptionFilter[]
}

export interface NormalizedCharacterChoice {
  id: string
  label: string
  kind: NormalizedCharacterChoiceKind
  owner: {
    type: 'class' | 'subclass'
    name: string
    source: string
    subclassName?: string
    subclassSource?: string
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
  featureVariant?: {
    replacesFeatureName?: string
  }
  source: {
    kind: 'class-feature-options' | 'class-table' | 'optional-feature-progression'
    field: string
  }
}

export interface ClassChoiceDiagnostic {
  code:
    | 'invalid-count'
    | 'unresolved-options'
    | 'unsupported-required-choice'
    | 'unverified-required-choice'
  className: string
  classSource: string
  subclassName?: string
  subclassSource?: string
  featureName: string
  requiredChoice?: {
    target: NormalizedChoiceOptionReference
    replacedBy?: string
    replaces?: string
  }
  level?: number
  message: string
  featureVariant?: {
    replacesFeatureName?: string
  }
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
