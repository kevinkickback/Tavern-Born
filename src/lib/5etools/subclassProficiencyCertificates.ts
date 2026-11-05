import type { SubclassFeature, SubclassFeatureReference } from '@/types/5etools'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
  getSubclassOwnerIdentity,
  isExactSubclassFeatureReference as isExactSubclassProficiencyReference,
} from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'

type SubclassProficiencyOwner = [string, string, string, string]
export interface SubclassProficiencyPath {
  target: string
  refs: string[]
  level: number
}
export interface SubclassProficiencyFeatureCertificate {
  target: string
  rawDigest: string
  metadataDigest: string
  fields: string[]
  entries: Array<{ digest: string; reference?: string }>
  copies: Array<{ target: string; digest: string }>
}
export interface SubclassProficiencyRootCertificate {
  owner: SubclassProficiencyOwner
  shortName: string
  rawDigest: string
  metadataDigest: string
  fields: string[]
  copies: Array<{ key: string; digest: string }>
  declarations: string[]
  intro: string
  paths: SubclassProficiencyPath[]
}
export interface SubclassProficiencyPackage {
  features: SubclassProficiencyFeatureCertificate[]
  roots: SubclassProficiencyRootCertificate[]
}
export interface SubclassProficiencyCheckpoint extends SubclassProficiencyPackage {
  packages?: SubclassProficiencyPackage[]
}
export interface SubclassProficiencySourceAudit {
  version: 1
  certificate: string
  origin: string
  verified: boolean
  package?: string
}

/** Exact production subclass copy lookup, distinct from its canonical selected-owner tuple. */
export function getSubclassCopyLookupKey(value: Record<string, unknown>): string | undefined {
  const fields = ['name', 'source', 'shortName', 'className', 'classSource']
  return fields.every((field) => typeof value[field] === 'string' && value[field])
    ? fields.map((field) => value[field]).join('|')
    : undefined
}

export const getSubclassProficiencyOwner = getSubclassOwnerIdentity

export const subclassProficiencyDigest = (value: unknown) => getFeatureSourceDigest([value], false)
export function subclassProficiencyMetadata(value: Record<string, unknown>, root = false) {
  const derived = new Set([
    'entries',
    'featureOptionSourceConflict',
    'subclassProficiencySourceAudit',
    ...(root
      ? [
          'subclassFeatures',
          'subclassFeatureRefs',
          'introFeatureRef',
          'levelFeatures',
          'normalizedRules',
        ]
      : []),
  ])
  return Object.fromEntries(Object.entries(value).filter(([key]) => !derived.has(key)))
}

export { isExactSubclassProficiencyReference }

/** Traverse the production UID shape without changing target printing or enclosing earned level. */
export function collectSubclassProficiencyPaths(
  refs: readonly SubclassFeatureReference[],
  resolve: (target: string) => SubclassFeature | undefined,
  verifyAttached?: (target: string, feature: SubclassFeature) => boolean,
): SubclassProficiencyPath[] {
  const paths: SubclassProficiencyPath[] = []
  const visit = (
    uid: string,
    reference: Record<string, unknown>,
    previous: string[],
    earned: number,
  ) => {
    if (!isExactSubclassProficiencyReference(reference, uid)) return
    const decoded = decodeSubclassFeatureReference(uid)
    const target = getSubclassFeatureIdentity(decoded)!
    if (
      verifyAttached &&
      (reference.sourceIdentityConflict ||
        reference.featureOptionSourceConflict ||
        !reference.feature ||
        !verifyAttached(target, reference.feature as SubclassFeature))
    )
      return
    if (
      previous.some(
        (ref) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref)) === target,
      )
    )
      return
    const path = [...previous, uid]
    const level = Math.max(earned, decoded.level!)
    paths.push({ target, refs: path, level })
    const feature = resolve(target)
    if (!feature || getSubclassFeatureIdentity(feature) !== target) return
    const scan = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(scan)
        return
      }
      const entry = value as Record<string, unknown>
      if (entry.type === 'options') return
      if (entry.type === 'refSubclassFeature') {
        if (typeof entry.subclassFeature === 'string')
          visit(entry.subclassFeature, entry, path, level)
        return
      }
      scan(entry.entries)
    }
    scan(verifyAttached ? (reference.feature as SubclassFeature).entries : feature.entries)
  }
  refs.forEach((reference) => {
    if (typeof reference.ref === 'string')
      visit(reference.ref, reference as unknown as Record<string, unknown>, [], 0)
  })
  return paths
}
