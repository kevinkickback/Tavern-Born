import type { OptFeatureProg } from '@/types/5etools'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import type { OptionalDeclarationOwner } from './optionalClassDeclarationStructure'
import type { OptionalClassAdoptionRoot } from './optionalClassFeatureRules'
import generated from './optionalClassNativeRules.generated.json' with { type: 'json' }

export interface OptionalNativeAdoptionRoot extends Omit<OptionalClassAdoptionRoot, 'owner'> {
  owner: OptionalDeclarationOwner
  original?: { target: string; name: string; source: string }
}
export interface OptionalNativePool {
  owner: OptionalDeclarationOwner
  target: string
  level: number
  dependency: { owner: OptionalDeclarationOwner; target: string; level: number }
  choiceId: string
  progressionField: string
  progression: OptFeatureProg
  members: NormalizedChoiceOptionReference[]
}
export const OPTIONAL_NATIVE_ROOTS =
  generated.roots as unknown as readonly OptionalNativeAdoptionRoot[]
export const OPTIONAL_NATIVE_POOLS = generated.pools as unknown as readonly OptionalNativePool[]
