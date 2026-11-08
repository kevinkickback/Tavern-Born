import type { ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import { PSIONIC_ORDERS } from './psionicIdentity'
import rules from './psionicSourceRules.generated.json' with { type: 'json' }

const digests = new Map(rules.map((row) => [row.target, row.digest]))
export const isDirectPsionicSourceTarget = (target: string | undefined) =>
  !!target && digests.has(target)
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
  'subclassProficiencySourceAudit',
])

const bonusCounts = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function readBonusDisciplines(feature: ClassFeature) {
  if (feature.entries?.length !== 1 || typeof feature.entries[0] !== 'string') return undefined
  const match =
    /^At (\d+)(?:st|nd|rd|th) level, you learn (\w+) additional psionic disciplines of your choice\. They must be chosen from among the \{@filter [^{}|]+\|psionics\|type=D\|order=([A-Za-z ]+)\}\.$/.exec(
      feature.entries[0],
    )
  const count = match ? bonusCounts.indexOf(match[2]) + 1 : 0
  const order = PSIONIC_ORDERS.find((name) => name === match?.[3])
  return match && Number(match[1]) === feature.level && count && order
    ? { count, order }
    : undefined
}
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
  if (identity !== target || !digests.has(target)) return false
  if (feature.name === 'Bonus Disciplines') {
    const rule = readBonusDisciplines(feature)
    return !!rule && target.split('|')[4] === rule.order.toLowerCase()
  }
  return getFeatureSourceDigest(feature.entries) === digests.get(target)
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
