import type { Item5e } from '../../src/types/5etools'
import type { ConcreteToolAssessment } from '../../src/lib/5etools/concreteToolClassification'
import type {
  FixedProficiencyRule,
  DirectFixedClassCertificate,
} from '../../src/lib/5etools/fixedProficiencyRules'
import type * as identity from '../../src/lib/5etools/classFeatureIdentity'
import type * as preparation from '../../src/lib/5etools/subclassSourcePreparation'
import type * as certificates from '../../src/lib/5etools/subclassProficiencyCertificates'
import type * as audit from '../../src/lib/5etools/featureSourceAudit'
export function deriveFixedProficiencyRules(
  documents: readonly Record<string, unknown>[],
  api: {
    materializeFeatures: typeof preparation.materializeSubclassFeatureCopies
    subclassIdentity: typeof identity.getSubclassFeatureIdentity
    classIdentity: typeof identity.getClassFeatureIdentity
    decodeClass: typeof identity.decodeClassFeatureReference
    entriesDigest: typeof audit.getFeatureSourceDigest
    digest: typeof certificates.subclassProficiencyDigest
    metadata: typeof certificates.subclassProficiencyMetadata
  },
): { features: FixedProficiencyRule[]; directClasses: DirectFixedClassCertificate[] }
export function deriveConcreteToolNames(
  records: readonly Item5e[],
  assess: (item: Item5e) => ConcreteToolAssessment,
): string[]
