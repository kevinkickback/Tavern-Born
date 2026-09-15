import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import type { Feat5e, Spell5e } from '@/types/5etools'

export type CharacterReadinessSeverity = 'blocking' | 'recommendation'

export type CharacterReadinessSection =
  | 'identity'
  | 'rules'
  | 'race'
  | 'class'
  | 'background'
  | 'ability-scores'
  | 'proficiencies'
  | 'feats'
  | 'spells'
  | 'equipment'
  | 'portrait'
  | 'sources'

export interface CharacterReadinessIssue {
  id: string
  severity: CharacterReadinessSeverity
  section: CharacterReadinessSection
  title: string
  explanation: string
  navigationTarget: string
}

export interface CharacterReadinessResult {
  status: 'ready' | 'incomplete'
  issues: CharacterReadinessIssue[]
  blockingIssues: CharacterReadinessIssue[]
  recommendations: CharacterReadinessIssue[]
}

export interface CharacterReadinessContext {
  calculation?: CharacterCalculationContext | null
  featsByKey?: Readonly<Record<string, Feat5e>>
  spellsByKey?: Readonly<Record<string, Spell5e>>
}
