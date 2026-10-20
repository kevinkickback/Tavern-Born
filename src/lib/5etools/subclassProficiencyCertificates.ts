import type { SubclassFeature, SubclassFeatureReference } from '@/types/5etools'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'

export type SubclassProficiencyOwner = [string, string, string, string]
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
export interface SubclassProficiencyCheckpoint {
  features: SubclassProficiencyFeatureCertificate[]
  roots: SubclassProficiencyRootCertificate[]
}
export interface SubclassProficiencySourceAudit {
  version: 1
  certificate: string
  origin: string
  verified: boolean
}

/** Exact production subclass copy lookup, distinct from its canonical selected-owner tuple. */
export function getSubclassCopyLookupKey(value: Record<string, unknown>): string | undefined {
  const fields = ['name', 'source', 'shortName', 'className', 'classSource']
  return fields.every((field) => typeof value[field] === 'string' && value[field])
    ? fields.map((field) => value[field]).join('|')
    : undefined
}

export function getSubclassProficiencyOwner(
  value: Record<string, unknown>,
): SubclassProficiencyOwner | undefined {
  const fields = ['className', 'classSource', 'name', 'source'] as const
  const parts = fields.map((field) => value[field])
  return parts.every((part) => typeof part === 'string' && part.trim())
    ? (parts.map((part) => (part as string).trim().toLowerCase()) as SubclassProficiencyOwner)
    : undefined
}

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

/** Every explicit identity field agrees independently; an otherwise unique UID cannot repair it. */
export function isExactSubclassProficiencyReference(
  value: Record<string, unknown>,
  uid: string,
): boolean {
  const decoded = decodeSubclassFeatureReference(uid)
  if (!getSubclassFeatureIdentity(decoded)) return false
  const identityFields = [
    'name',
    'source',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
  ] as const
  return identityFields.every(
    (field) =>
      value[field] === undefined ||
      (typeof decoded[field] === 'number'
        ? value[field] === decoded[field]
        : typeof value[field] === 'string' &&
          value[field].trim().toLowerCase() === String(decoded[field]).trim().toLowerCase()),
  )
}

/** Traverse the production UID shape without changing target printing or enclosing earned level. */
export function collectSubclassProficiencyPaths(
  refs: readonly SubclassFeatureReference[],
  resolve: (target: string) => SubclassFeature | undefined,
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
    scan(feature.entries)
  }
  refs.forEach((reference) => {
    if (typeof reference.ref === 'string')
      visit(reference.ref, reference as unknown as Record<string, unknown>, [], 0)
  })
  return paths
}
