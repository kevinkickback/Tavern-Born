import type { OptionalClassFeatureCheckpoint } from '../../src/lib/5etools/optionalClassFeatureRules'
import type * as identity from '../../src/lib/5etools/classFeatureIdentity'
import type * as preparation from '../../src/lib/5etools/subclassSourcePreparation'
import type * as certificates from '../../src/lib/5etools/subclassProficiencyCertificates'
export interface OptionalClassSourceApi {
  classIdentity: typeof identity.getClassFeatureIdentity
  subclassIdentity: typeof identity.getSubclassFeatureIdentity
  decodeClass: typeof identity.decodeClassFeatureReference
  materializeSubclassFeatures: typeof preparation.materializeSubclassFeatureCopies
  digest: typeof certificates.subclassProficiencyDigest
}
export function deriveOptionalClassFeatureRules(
  documents: readonly Record<string, unknown>[],
  ruleRows: readonly Record<string, unknown>[],
  api: OptionalClassSourceApi,
): OptionalClassFeatureCheckpoint
