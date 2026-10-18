import type { ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import {
  DEFT_EXPLORER_TARGET,
  NATURAL_EXPLORER_GRANTS,
  NATURAL_EXPLORER_TARGET,
} from './naturalExplorerIdentity'

// Configured Ranger SHAe22da39d; bundled SRD SHAc5d37fb8. Genuine complete bodies, no enrichment stripping.
const DIGESTS: ReadonlyMap<string, string> = new Map([
  [NATURAL_EXPLORER_TARGET, 'cbd3e1077f3b80146957fa78e5307763f7488eab6a58905d41c90b43504fd7c1'],
  [
    NATURAL_EXPLORER_GRANTS[1].target,
    '9144983943f6ae85d98c071a0b5defb14fa45d1a0924200a1bf6cd9c40aef5a2',
  ],
  [
    NATURAL_EXPLORER_GRANTS[2].target,
    'e0c4f2ba1b9845771ad7e14d54fb9962951e2124816e10ef5abb87196961e052',
  ],
  [DEFT_EXPLORER_TARGET, '82cfa1cf0129c848cd9a5a6309430e16b0afe73d90c66caf6d4923374b58d08a'],
])
const COMMON_FIELDS = [
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'page',
  'featureOptionSourceConflict',
]
const BASE_FIELDS = new Set([...COMMON_FIELDS, 'srd'])
const REPLACEMENT_FIELDS = new Set([...COMMON_FIELDS, 'isClassFeatureVariant'])
export function isAuditedNaturalExplorerFeature(
  feature: ClassFeature | Record<string, unknown> | undefined,
): boolean {
  if (
    !feature ||
    feature.featureOptionSourceConflict ||
    !Array.isArray(feature.entries) ||
    !feature.entries.length
  )
    return false
  const target = getClassFeatureIdentity(feature)
  const expected = target && DIGESTS.get(target)
  const replacement = target === DEFT_EXPLORER_TARGET
  return (
    !!expected &&
    hasFeatureSourceShape(feature, replacement ? REPLACEMENT_FIELDS : BASE_FIELDS) &&
    (!replacement || feature.isClassFeatureVariant === true) &&
    getFeatureSourceDigest(feature.entries, false) === expected
  )
}

/** Qualify every raw producer before the parser's first-match index, including extra semantic metadata. */
export function auditNaturalExplorerSources(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  const invalid = new Set<string>()
  const cleaned = records.map((record) => {
    const target = getClassFeatureIdentity(record)
    if (!target || !DIGESTS.has(target)) return record
    const { featureOptionSourceConflict: _derived, ...feature } = record
    if (!isAuditedNaturalExplorerFeature(feature)) invalid.add(target)
    return feature
  })
  return cleaned.map((feature) =>
    invalid.has(getClassFeatureIdentity(feature) ?? '')
      ? { ...feature, featureOptionSourceConflict: true }
      : feature,
  )
}
export interface ClassFeatureSourceCatalog {
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
}
const sourceCache = new WeakMap<object, ReadonlyMap<string, ClassFeature | undefined>>()
/** Candidate bundles are immutable and replaced on source refresh, as are the existing filtered catalogs. */
export function getNaturalExplorerSources(
  catalogs: ClassFeatureSourceCatalog | undefined,
): ReadonlyMap<string, ClassFeature | undefined> {
  if (!catalogs) return new Map()
  const snapshot = catalogs.classFeatureCandidates ?? catalogs.classFeatures
  const cached = sourceCache.get(snapshot)
  if (cached) return cached
  const resolved = new Map<string, ClassFeature | undefined>()
  for (const target of DIGESTS.keys()) {
    const candidates =
      catalogs.classFeatureCandidates !== undefined
        ? (catalogs.classFeatureCandidates.get(target) ?? [])
        : catalogs.classFeatures.filter((feature) => getClassFeatureIdentity(feature) === target)
    resolved.set(
      target,
      candidates.length &&
        (target !== DEFT_EXPLORER_TARGET || candidates.length === 1) &&
        candidates.every(
          (feature) =>
            getClassFeatureIdentity(feature) === target && isAuditedNaturalExplorerFeature(feature),
        )
        ? candidates[0]
        : undefined,
    )
  }
  sourceCache.set(snapshot, resolved)
  return resolved
}
