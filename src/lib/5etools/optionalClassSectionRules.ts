import type {
  OptionalClassFeatureCertificate,
  OptionalClassParentCertificate,
  OptionalClassSourceOwner,
} from './optionalClassFeatureRules'
import generated from './optionalClassSectionRules.generated.json' with { type: 'json' }
import type { OptionalSectionLocator } from './optionalClassSectionStructure'

export interface OptionalClassSectionDescriptor {
  target: string
  owner: OptionalClassSourceOwner
  name: string
  source: string
  level: number
  locator: OptionalSectionLocator
  digest: string
  members: Array<['spell' | 'optionalFeature', string, string]>
  grantingTarget: string
  progression?: { name: string; featureType: string[]; progression: unknown }
}
export const OPTIONAL_CLASS_SECTION_RULES = generated as unknown as {
  version: 3
  sections: OptionalClassSectionDescriptor[]
  parents: OptionalClassParentCertificate[]
  features: OptionalClassFeatureCertificate[]
}
