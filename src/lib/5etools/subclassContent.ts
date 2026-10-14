import { normalizeKey } from '@/lib/provenance/normalization'
import type { SubclassFeatureReference } from '@/types/5etools'

/** Derive the intro from its declared, exactly resolved feature. */
export function getSubclassIntroEntries(
  subclass: { name?: unknown; shortName?: unknown },
  references: readonly SubclassFeatureReference[],
): unknown[] {
  const name = normalizeKey(subclass.name)
  const shortName = normalizeKey(subclass.shortName)
  const intro = references.find(
    (reference) =>
      normalizeKey(reference.name) === shortName || normalizeKey(reference.name) === name,
  )
  return Array.isArray(intro?.feature?.entries) ? intro.feature.entries : []
}
