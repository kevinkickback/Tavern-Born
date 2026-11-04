import type { Class5e } from '@/types/5etools'
import {
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import {
  CONDITIONAL_OPTIONAL_CERTIFICATES,
  CONDITIONAL_PROFICIENCY_RULES,
} from './conditionalProficiencyRules'
import { getConditionalOptionalIdentity } from './conditionalProficiencySource'
import { directFeatures, directOwners, ownerKey } from './directFixedProficiencySource'
import { FIXED_PROFICIENCY_RULES } from './fixedProficiencyRules'
import { getSubclassProficiencyOwner } from './subclassProficiencyCertificates'
import {
  isConditionalOnlySubclassProficiencyTarget,
  SUBCLASS_PROFICIENCY_CHECKPOINT,
} from './subclassProficiencyRegistry'

const fixedTargets = new Set(
  [
    ...FIXED_PROFICIENCY_RULES.filter((rule) => !directFeatures.has(rule.target)),
    ...CONDITIONAL_PROFICIENCY_RULES.filter((rule) => rule.target.startsWith('subclass-feature|')),
  ].map((rule) => rule.target),
)
const subclassRoots = SUBCLASS_PROFICIENCY_CHECKPOINT.roots.filter((root) =>
  root.paths.some((path) => fixedTargets.has(path.target)),
)
const consumedSubclassTargets = new Set(
  subclassRoots
    .flatMap((root) => [root.intro, ...root.paths.flatMap((path) => path.refs)])
    .map((uid) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))!),
)
const conditionalOptionalTargets = new Set(
  CONDITIONAL_OPTIONAL_CERTIFICATES.map((row) => row.target),
)
/** Same-layer duplicates must stay invalid even if a later Map would otherwise pick one. */
export function auditFixedLayerMultiplicity<T extends object>(
  records: readonly T[],
  kind: 'classes' | 'classFeatures' | 'named' | 'optionalFeatures',
): T[] {
  const identity = (row: T) => {
    if (kind === 'classes') return ownerKey(row as Record<string, unknown>)
    if (kind === 'classFeatures') return getClassFeatureIdentity(row)
    // Conditional certificates already distinguish raw producers from agreeing enrichment mirrors.
    if (
      kind === 'optionalFeatures' &&
      conditionalOptionalTargets.has(getConditionalOptionalIdentity(row) ?? '')
    )
      return undefined
    const record = row as Record<string, unknown> | null
    return record && typeof record.name === 'string' && typeof record.source === 'string'
      ? JSON.stringify([record.name.trim().toLowerCase(), record.source.trim().toLowerCase()])
      : undefined
  }
  const known = (key: string | undefined) =>
    !!key &&
    (kind === 'classes'
      ? directOwners.has(key)
      : kind === 'classFeatures' && directFeatures.has(key))
  const counts = new Map<string, number>()
  for (const row of records) {
    const key = identity(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return records.map((row) => {
    const key = identity(row)
    if (!key || (counts.get(key) ?? 0) < 2) return row
    if (!known(key)) return { ...row, sourceIdentityConflict: true }
    const old = (row as Record<string, unknown>).fixedProficiencySourceAudit
    return {
      ...row,
      sourceIdentityConflict: true,
      fixedProficiencySourceAudit:
        old && typeof old === 'object'
          ? { ...old, verified: false }
          : { version: 1, certificate: '', origin: 'ambiguous-layer', verified: false },
    }
  })
}

/** Preserve competing source owners before class Maps; also audit finite proficiency producers. */
export function auditProficiencySubclassLayerMultiplicity(classes: readonly Class5e[]): Class5e[] {
  const parents = new Map<string, number>()
  const owners = new Map<string, number>()
  const producers = new Map<string, Set<string | object>>()
  const seen = new WeakSet<object>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    const row = value as Record<string, unknown>
    const target = getSubclassFeatureIdentity(row)
    if (target && consumedSubclassTargets.has(target) && Array.isArray(row.entries)) {
      const audit = row.subclassProficiencySourceAudit as { origin?: string } | undefined
      const occurrences = producers.get(target) ?? new Set<string | object>()
      occurrences.add(typeof audit?.origin === 'string' ? audit.origin : row)
      producers.set(target, occurrences)
    }
    Object.values(value).forEach(visit)
  }
  for (const cls of classes) {
    const parent = ownerKey(cls)
    parents.set(parent, (parents.get(parent) ?? 0) + 1)
    for (const subclass of cls.subclasses ?? []) {
      const owner = JSON.stringify(getSubclassProficiencyOwner(subclass))
      owners.set(owner, (owners.get(owner) ?? 0) + 1)
    }
    visit(cls.subclasses)
  }
  const ambiguousTargets = new Set(
    [...producers].filter(([, rows]) => rows.size > 1).map(([target]) => target),
  )
  const ambiguousOwners = new Set(
    subclassRoots
      .filter(
        (root) =>
          (parents.get(JSON.stringify(root.owner.slice(0, 2))) ?? 0) > 1 ||
          (owners.get(JSON.stringify(root.owner)) ?? 0) > 1,
      )
      .map((root) => JSON.stringify(root.owner)),
  )
  const competingParents = new Set(
    [...parents].filter(([, count]) => count > 1).map(([key]) => key),
  )
  const competingOwners = new Set([...owners].filter(([, count]) => count > 1).map(([key]) => key))
  if (
    !ambiguousTargets.size &&
    !ambiguousOwners.size &&
    !competingParents.size &&
    !competingOwners.size
  )
    return [...classes]
  // Keep every mirror of a producer invalid, including the inputs used for later re-enrichment.
  const corrected = structuredClone(classes) as Class5e[]
  const changed = new WeakSet<object>()
  const invalidate = (value: unknown) => {
    if (!value || typeof value !== 'object' || changed.has(value)) return
    changed.add(value)
    const row = value as Record<string, unknown>
    const target = getSubclassFeatureIdentity(row)
    if (target && ambiguousTargets.has(target) && Array.isArray(row.entries)) {
      if (!isConditionalOnlySubclassProficiencyTarget(target))
        row.featureOptionSourceConflict = true
      const audit = row.subclassProficiencySourceAudit
      if (audit && typeof audit === 'object')
        row.subclassProficiencySourceAudit = { ...audit, verified: false }
    }
    Object.values(value).forEach(invalidate)
  }
  for (const cls of corrected) {
    if (competingParents.has(ownerKey(cls))) cls.sourceIdentityConflict = true
    for (const subclass of cls.subclasses ?? []) {
      if (
        cls.sourceIdentityConflict ||
        competingOwners.has(JSON.stringify(getSubclassProficiencyOwner(subclass)))
      )
        subclass.sourceIdentityConflict = true
      if (ambiguousOwners.has(JSON.stringify(getSubclassProficiencyOwner(subclass)))) {
        const audit = subclass.subclassProficiencySourceAudit
        subclass.subclassProficiencySourceAudit = audit
          ? { ...audit, verified: false }
          : { version: 1, certificate: '', origin: 'ambiguous-layer', verified: false }
      }
    }
    invalidate(cls.subclasses)
  }
  return corrected
}
