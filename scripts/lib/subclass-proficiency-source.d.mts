import type { ClassProficiencyRule } from '../../src/lib/5etools/classProficiencyRules'
import type { SubclassProficiencyCheckpoint } from '../../src/lib/5etools/subclassProficiencyCertificates'
import type { ClassifiableItem } from '../../src/lib/calculations/itemClassification'
import type * as certificates from '../../src/lib/5etools/subclassProficiencyCertificates'
import type * as preparation from '../../src/lib/5etools/subclassSourcePreparation'
import type * as identity from '../../src/lib/5etools/classFeatureIdentity'
import type * as content from '../../src/lib/5etools/subclassContent'
import type * as audit from '../../src/lib/5etools/featureSourceAudit'
export function deriveArtisanToolPool(
  uid: string,
  documents: readonly Record<string, unknown>[],
  classify: {
    types: (type: ClassifiableItem['type']) => string[]
    selectable: (item: ClassifiableItem & { items?: unknown }) => boolean
  },
): { names: string[]; category: string; group: Record<string, unknown>; members: string[] }
export function deriveSubclassProficiencyRules(
  features: readonly Record<string, unknown>[],
  toolsFor: (uid: string) => { names: string[]; category: string },
  identityOf: typeof identity.getSubclassFeatureIdentity,
  digest: typeof audit.getFeatureSourceDigest,
): ClassProficiencyRule[]
export function deriveSubclassProficiencyCertificates(
  documents: readonly Record<string, unknown>[],
  rules: readonly Pick<ClassProficiencyRule, 'target'>[],
  api: {
    materializeRoots: typeof preparation.materializeSubclassCopies
    materializeFeatures: typeof preparation.materializeSubclassFeatureCopies
    identity: typeof identity.getSubclassFeatureIdentity
    decode: typeof identity.decodeSubclassFeatureReference
    copyKey: typeof certificates.getSubclassCopyLookupKey
    paths: typeof certificates.collectSubclassProficiencyPaths
    owner: typeof certificates.getSubclassProficiencyOwner
    digest: typeof certificates.subclassProficiencyDigest
    entriesDigest: typeof audit.getFeatureSourceDigest
    metadata: typeof certificates.subclassProficiencyMetadata
    intro: typeof content.getSubclassIntroReference
    validateProgression?: (root: Record<string, unknown>) => void
    admittedContexts?: readonly {
      owner: readonly string[]
      intro: string
      paths: readonly certificates.SubclassProficiencyPath[]
    }[]
  },
): SubclassProficiencyCheckpoint
