import type { ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import rules from './psionicSourceRules.generated.json' with { type: 'json' }

const digests = new Map(rules.map((row) => [row.target, row.digest]))
const fields = new Set([
  'name',
  'source',
  'page',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'header',
  'entries',
  'featureOptionSourceConflict',
])
export function isAuditedPsionicSource(feature: ClassFeature | undefined, target: string): boolean {
  if (
    !feature ||
    feature.featureOptionSourceConflict ||
    !hasFeatureSourceShape(feature, fields) ||
    !Array.isArray(feature.entries)
  )
    return false
  const identity = target.startsWith('subclass-feature|')
    ? getSubclassFeatureIdentity(feature)
    : getClassFeatureIdentity(feature)
  return (
    identity === target &&
    digests.has(target) &&
    getFeatureSourceDigest(feature.entries) === digests.get(target)
  )
}
/** Raw same-target competitors cannot disappear into the parser's first lookup. */
export function auditPsionicFeatureSources(
  records: Record<string, unknown>[],
  subclass = false,
): Record<string, unknown>[] {
  const identity = subclass ? getSubclassFeatureIdentity : getClassFeatureIdentity
  const counts = new Map<string, number>()
  for (const row of records) {
    const id = identity(row)
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return records.map((row) => {
    const id = identity(row)
    return id &&
      digests.has(id) &&
      ((counts.get(id) ?? 0) !== 1 || !isAuditedPsionicSource(row as unknown as ClassFeature, id))
      ? { ...row, featureOptionSourceConflict: true }
      : row
  })
}
