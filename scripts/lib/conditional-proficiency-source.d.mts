import type {
  ConditionalProficiencyRule,
  ConditionalOptionalCertificate,
} from '../../src/lib/5etools/conditionalProficiencyRules'
import type * as preparation from '../../src/lib/5etools/subclassSourcePreparation'
import type * as identity from '../../src/lib/5etools/classFeatureIdentity'
import type * as certificates from '../../src/lib/5etools/subclassProficiencyCertificates'
import type * as terrain from '../../src/lib/5etools/naturalExplorerSource'
export interface ConditionalSourceApi {
  materializeFeatures: typeof preparation.materializeSubclassFeatureCopies
  materializeRoots: typeof preparation.materializeSubclassCopies
  identity: typeof identity.getSubclassFeatureIdentity
  classIdentity: typeof identity.getClassFeatureIdentity
  optionalIdentity: (value: Record<string, unknown>) => string | undefined
  digest: typeof certificates.subclassProficiencyDigest
  terrainTarget: string
  isTerrainSource: typeof terrain.isAuditedNaturalExplorerFeature
}
export function deriveConditionalProficiencyRules(
  documents: readonly Record<string, unknown>[],
  optionalRecords: readonly Record<string, unknown>[],
  api: ConditionalSourceApi,
): { features: ConditionalProficiencyRule[]; optional: ConditionalOptionalCertificate[] }
export function validateConditionalSubclassProgression(
  root: Record<string, unknown>,
  rules: readonly ConditionalProficiencyRule[],
): void
