import type { Class5e, ClassFeature } from '@/types/5etools'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import { CONDITIONAL_PROFICIENCY_RULES } from './conditionalProficiencyRules'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  DIRECT_FIXED_CLASS_CERTIFICATES,
  FIXED_PROFICIENCY_RULES,
  type FixedProficiencyRule,
} from './fixedProficiencyRules'
import {
  getSubclassProficiencyOwner,
  subclassProficiencyDigest,
  subclassProficiencyMetadata,
} from './subclassProficiencyCertificates'
import {
  isConditionalOnlySubclassProficiencyTarget,
  SUBCLASS_PROFICIENCY_CHECKPOINT,
} from './subclassProficiencyRegistry'

export interface FixedProficiencySourceAudit {
  version: 1
  certificate: string
  origin: string
  verified: boolean
}
const directFeatures = new Map(
  FIXED_PROFICIENCY_RULES.filter((rule) => rule.kind === 'proficient-tools').map((rule) => [
    rule.target,
    rule,
  ]),
)
const directOwners = new Map(
  DIRECT_FIXED_CLASS_CERTIFICATES.map((row) => [JSON.stringify(row.owner), row]),
)
const fixedTargets = new Set(
  [
    ...FIXED_PROFICIENCY_RULES.filter((rule) => rule.kind !== 'proficient-tools'),
    ...CONDITIONAL_PROFICIENCY_RULES.filter((rule) => rule.target.startsWith('subclass-feature|')),
  ].map((rule) => rule.target),
)
const subclassRoots = SUBCLASS_PROFICIENCY_CHECKPOINT.roots.filter((root) =>
  root.paths.some((path) => fixedTargets.has(path.target)),
)
const subclassOwners = new Map(subclassRoots.map((root) => [JSON.stringify(root.owner), root]))
const subclassParents = new Set(subclassRoots.map((root) => JSON.stringify(root.owner.slice(0, 2))))
const consumedSubclassTargets = new Set(
  subclassRoots
    .flatMap((root) => [root.intro, ...root.paths.flatMap((path) => path.refs)])
    .map((uid) => getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))!),
)
const ownerKey = (row: Record<string, unknown>) =>
  JSON.stringify(
    [row.name, row.source].map((value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    ),
  )
const stamp = (
  certificate: unknown,
  origin: string,
  verified: boolean,
): FixedProficiencySourceAudit => ({
  version: 1,
  certificate: subclassProficiencyDigest(certificate)!,
  origin,
  verified,
})
function isStamped(value: unknown, certificate: unknown): value is FixedProficiencySourceAudit {
  if (!value || typeof value !== 'object') return false
  const row = value as FixedProficiencySourceAudit
  return (
    row.version === 1 &&
    row.verified === true &&
    typeof row.origin === 'string' &&
    !!row.origin &&
    row.certificate === subclassProficiencyDigest(certificate) &&
    Object.keys(row).every((key) => ['version', 'certificate', 'origin', 'verified'].includes(key))
  )
}
function matchesFeature(
  feature: ClassFeature | Record<string, unknown>,
  rule: FixedProficiencyRule,
) {
  const { fixedProficiencySourceAudit: _audit, ...source } = feature
  return (
    !feature.featureOptionSourceConflict &&
    Array.isArray(feature.entries) &&
    getClassFeatureIdentity(feature) === rule.target &&
    Object.keys(feature).every((key) => rule.fields.includes(key)) &&
    getFeatureSourceDigest(feature.entries, false) === rule.digest &&
    subclassProficiencyDigest(subclassProficiencyMetadata(source)) === rule.metadataDigest
  )
}
function declarationOccurrences(value: unknown, target: string): number {
  if (typeof value === 'string')
    return getClassFeatureIdentity(decodeClassFeatureReference(value)) === target ? 1 : 0
  if (!value || typeof value !== 'object') return 0
  return Object.values(value).reduce<number>(
    (sum, row) => sum + declarationOccurrences(row, target),
    0,
  )
}

/** Count every raw occurrence before the parser's feature-index projection. */
export function auditFixedClassFeatures(records: Record<string, unknown>[], origin: string) {
  return records.map((feature, index) => {
    const target = getClassFeatureIdentity(feature),
      rule = target && directFeatures.get(target)
    if (!rule) return feature
    const verified =
      !Object.getOwnPropertyDescriptor(feature, 'fixedProficiencySourceAudit') &&
      records.filter((row) => getClassFeatureIdentity(row) === target).length === 1 &&
      matchesFeature(feature, rule)
    return {
      ...feature,
      fixedProficiencySourceAudit: stamp(rule, `${origin}:classFeature:${index}`, verified),
    }
  })
}

/** Preserve raw declaration shape and class multiplicity before reference parsing discards fields. */
export function auditDirectFixedClassDeclarations(
  records: Record<string, unknown>[],
  origin: string,
) {
  return records.map((root, index) => {
    const certificate = directOwners.get(ownerKey(root))
    if (!certificate) return root
    const declarations = Array.isArray(root.classFeatures) ? root.classFeatures : []
    const ordinal = declarations.findIndex(
      (row) =>
        typeof row === 'string' && subclassProficiencyDigest(row) === certificate.declarationDigest,
    )
    const verified =
      !Object.getOwnPropertyDescriptor(root, 'fixedProficiencySourceAudit') &&
      !root._copy &&
      records.filter((row) => ownerKey(row) === ownerKey(root)).length === 1 &&
      declarationOccurrences(declarations, certificate.target) === 1 &&
      ordinal >= 0 &&
      declarations[ordinal] === certificate.rawDeclaration
    return {
      ...root,
      fixedProficiencySourceAudit: stamp(
        certificate,
        `${origin}:class:${index}:declaration:${ordinal}`,
        verified,
      ),
    }
  })
}

/** Same-layer duplicates must stay invalid even if a later Map would otherwise pick one. */
export function auditFixedLayerMultiplicity<T extends object>(
  records: readonly T[],
  kind: 'classes' | 'classFeatures',
): T[] {
  const identity = (row: T) =>
    kind === 'classes' ? ownerKey(row as Record<string, unknown>) : getClassFeatureIdentity(row)
  const known = (key: string | undefined) =>
    !!key && (kind === 'classes' ? directOwners.has(key) : directFeatures.has(key))
  const counts = new Map<string, number>()
  for (const row of records) {
    const key = identity(row)
    if (known(key)) counts.set(key!, (counts.get(key!) ?? 0) + 1)
  }
  return records.map((row) => {
    const key = identity(row)
    if (!known(key) || (counts.get(key!) ?? 0) < 2) return row
    const old = (row as Record<string, unknown>).fixedProficiencySourceAudit
    return {
      ...row,
      fixedProficiencySourceAudit:
        old && typeof old === 'object'
          ? { ...old, verified: false }
          : { version: 1, certificate: '', origin: 'ambiguous-layer', verified: false },
    }
  })
}

/** Audit finite subclass contexts before class/feature Maps erase competing raw producers. */
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
    if (subclassParents.has(parent)) parents.set(parent, (parents.get(parent) ?? 0) + 1)
    for (const subclass of cls.subclasses ?? []) {
      const owner = JSON.stringify(getSubclassProficiencyOwner(subclass))
      if (subclassOwners.has(owner)) owners.set(owner, (owners.get(owner) ?? 0) + 1)
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
  if (!ambiguousTargets.size && !ambiguousOwners.size) return [...classes]
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
    for (const subclass of cls.subclasses ?? []) {
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

function currentFeature(rule: FixedProficiencyRule, candidates: readonly ClassFeature[]) {
  if (
    !candidates.length ||
    candidates.some(
      (row) => !isStamped(row.fixedProficiencySourceAudit, rule) || !matchesFeature(row, rule),
    )
  )
    return undefined
  return new Set(
    candidates.map(
      (row) => (row.fixedProficiencySourceAudit as FixedProficiencySourceAudit).origin,
    ),
  ).size === 1
    ? candidates[0]
    : undefined
}

/** Explicit current raw declarations, direct refs, catalogs and embedded producer must all agree. */
export function getCurrentDirectFixedClassRules(
  classData: Class5e,
  catalogs: {
    classFeatures: readonly ClassFeature[]
    classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
  },
): FixedProficiencyRule[] {
  const certificate = directOwners.get(ownerKey(classData))
  if (
    !certificate ||
    classData._copy ||
    !isStamped(classData.fixedProficiencySourceAudit, certificate) ||
    !Array.isArray(classData.classFeatures) ||
    declarationOccurrences(classData.classFeatures, certificate.target) !== 1 ||
    classData.classFeatures.filter((row) => row === certificate.rawDeclaration).length !== 1 ||
    !Array.isArray(classData.classFeatureRefs)
  )
    return []
  const refs = classData.classFeatureRefs.filter(
    (row) => getClassFeatureIdentity(decodeClassFeatureReference(row.ref)) === certificate.target,
  )
  if (refs.length !== 1) return []
  const ref = refs[0],
    decoded = decodeClassFeatureReference(ref.ref)
  if (
    getClassFeatureIdentity(decoded) !== certificate.target ||
    ref.ref !== certificate.rawDeclaration ||
    ref.gainSubclassFeature === true ||
    Object.keys(ref).some(
      (key) =>
        ![
          'ref',
          'name',
          'className',
          'classSource',
          'source',
          'level',
          'gainSubclassFeature',
          'feature',
        ].includes(key),
    ) ||
    (['name', 'className', 'classSource', 'source', 'level'] as const).some(
      (key) =>
        ref[key] !== undefined &&
        (typeof decoded[key] === 'number'
          ? ref[key] !== decoded[key]
          : typeof ref[key] !== 'string' ||
            ref[key].trim().toLowerCase() !== String(decoded[key]).trim().toLowerCase()),
    )
  )
    return []
  const rule = directFeatures.get(certificate.target)
  const candidates =
    catalogs.classFeatureCandidates !== undefined
      ? (catalogs.classFeatureCandidates.get(certificate.target) ?? [])
      : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === certificate.target)
  return rule &&
    currentFeature(rule, candidates) &&
    ref.feature &&
    currentFeature(rule, [ref.feature])
    ? [rule]
    : []
}
