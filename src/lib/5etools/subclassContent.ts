import { normalizeKey } from '@/lib/provenance/normalization'
import type { Subclass5e, SubclassFeatureReference } from '@/types/5etools'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'

/** Choose the original intro declaration before any source filtering. */
export function getSubclassIntroReference(
  subclass: { name?: unknown; shortName?: unknown },
  references: readonly SubclassFeatureReference[],
): SubclassFeatureReference | undefined {
  const name = normalizeKey(subclass.name)
  const shortName = normalizeKey(subclass.shortName)
  return references.find(
    (reference) =>
      normalizeKey(reference.name) === shortName || normalizeKey(reference.name) === name,
  )
}

/** Filtering may remove the target but cannot promote a different intro declaration. */
export function getSubclassIntroEntries(
  subclass: Pick<Subclass5e, 'introFeatureRef'>,
  references: readonly SubclassFeatureReference[],
): unknown[] {
  const identity = subclass.introFeatureRef
    ? getSubclassFeatureIdentity(decodeSubclassFeatureReference(subclass.introFeatureRef))
    : undefined
  if (!identity) return []
  const feature = references.find(
    (reference) => getSubclassFeatureIdentity(reference) === identity,
  )?.feature
  return Array.isArray(feature?.entries) ? feature.entries : []
}
