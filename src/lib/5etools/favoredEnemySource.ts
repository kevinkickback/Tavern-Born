import type { ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { FAVORED_ENEMY_GRANTS, FAVORED_ENEMY_TARGET } from './favoredEnemyIdentity'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'

// PHB prose supplies the alternative/count/language relationship absent from structured declarations.
// Complete actual and bundled bodies agree; values are extracted from these certified current bodies.
const digests = new Map(
  FAVORED_ENEMY_GRANTS.map((g, i) => [
    g.target,
    [
      'bb804c1304d37d321e350978825b4697fbc6d4bd2f5e0ea056729cae5614910c',
      '9144983943f6ae85d98c071a0b5defb14fa45d1a0924200a1bf6cd9c40aef5a2',
      '47c401f6152cbc487f2b70c75ead8207b084c2520b33746c6e1019b792511b90',
    ][i],
  ]),
)
const fields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'page',
  'srd',
  'featureOptionSourceConflict',
])
export function isAuditedFavoredEnemyFeature(
  feature: ClassFeature | Record<string, unknown> | undefined,
): boolean {
  const expected = feature && digests.get(getClassFeatureIdentity(feature) ?? '')
  return (
    !!expected &&
    !!feature &&
    !feature.featureOptionSourceConflict &&
    hasFeatureSourceShape(feature, fields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) === expected
  )
}
export function auditFavoredEnemySources(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  const invalid = new Set<string>()
  for (const row of records) {
    const id = getClassFeatureIdentity(row)
    if (id && digests.has(id) && !isAuditedFavoredEnemyFeature(row)) invalid.add(id)
  }
  return records.map((row) =>
    invalid.has(getClassFeatureIdentity(row) ?? '')
      ? { ...row, featureOptionSourceConflict: true }
      : row,
  )
}
const cache = new WeakMap<object, ReadonlyMap<string, ClassFeature | undefined>>()
export function getFavoredEnemySources(
  catalogs: ClassFeatureSourceCatalog | undefined,
): ReadonlyMap<string, ClassFeature | undefined> {
  if (!catalogs) return new Map()
  const snapshot = catalogs.classFeatureCandidates ?? catalogs.classFeatures
  const prior = cache.get(snapshot)
  if (prior) return prior
  const resolved = new Map<string, ClassFeature | undefined>()
  for (const target of digests.keys()) {
    const rows =
      catalogs.classFeatureCandidates !== undefined
        ? (catalogs.classFeatureCandidates.get(target) ?? [])
        : catalogs.classFeatures.filter((f) => getClassFeatureIdentity(f) === target)
    resolved.set(
      target,
      rows.length &&
        rows.every((f) => getClassFeatureIdentity(f) === target && isAuditedFavoredEnemyFeature(f))
        ? rows[0]
        : undefined,
    )
  }
  cache.set(snapshot, resolved)
  return resolved
}
export function getFavoredEnemyContext(catalogs: ClassFeatureSourceCatalog | undefined): unknown[] {
  return getFavoredEnemySources(catalogs).get(FAVORED_ENEMY_TARGET)?.entries?.slice(2, 4) ?? []
}
