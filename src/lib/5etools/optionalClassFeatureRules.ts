import generated from './optionalClassFeatureRules.generated.json' with { type: 'json' }

export type OptionalClassSourceOwner = ['class', string, string]
export interface OptionalClassFeatureCertificate {
  target: string
  name: string
  source: string
  level: number
  fields: string[]
  digest: string
}
export interface OptionalClassDeclarationCertificate {
  target: string
  rawDeclaration: string
  level: number
}
export interface OptionalClassParentCertificate {
  owner: OptionalClassSourceOwner
  fields: string[]
  declarations: OptionalClassDeclarationCertificate[]
}
interface OptionalClassReplacementFacet {
  target: string
  facet?: string
  entryIndexes?: number[]
}
export interface OptionalClassAdoptionRoot {
  owner: OptionalClassSourceOwner
  target: string
  name: string
  source: string
  level: number
  family?: string
  children: string[]
  replaces: OptionalClassReplacementFacet[]
  compatible: string[]
}
export interface OptionalClassFeatureCheckpoint {
  version: 1
  knownOptionalTargets: Array<{ kind: 'classFeature' | 'subclassFeature'; target: string }>
  parents: OptionalClassParentCertificate[]
  features: OptionalClassFeatureCertificate[]
  roots: OptionalClassAdoptionRoot[]
}
export const OPTIONAL_CLASS_FEATURE_RULES = generated as unknown as OptionalClassFeatureCheckpoint
