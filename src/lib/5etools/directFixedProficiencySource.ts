import type { Class5e, ClassFeature } from '@/types/5etools'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  DIRECT_FIXED_CLASS_CERTIFICATES,
  type DirectFixedClassCertificate,
  FIXED_PROFICIENCY_RULES,
  type FixedProficiencyRule,
} from './fixedProficiencyRules'
import {
  subclassProficiencyDigest,
  subclassProficiencyMetadata,
} from './subclassProficiencyCertificates'

interface FixedProficiencySourceAudit {
  version: 1
  certificate: string
  origin: string
  verified: boolean
}
export const directFeatures: ReadonlyMap<string, FixedProficiencyRule> = new Map(
  FIXED_PROFICIENCY_RULES.filter((rule) => rule.target.startsWith('class-feature|')).map((rule) => [
    rule.target,
    rule,
  ]),
)
export const directOwners: ReadonlyMap<string, DirectFixedClassCertificate> = new Map(
  DIRECT_FIXED_CLASS_CERTIFICATES.map((row) => [JSON.stringify(row.owner), row]),
)
export const ownerKey = (row: Record<string, unknown>) =>
  JSON.stringify(
    [row.name, row.source].map((value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : null,
    ),
  )
export const getDirectFixedClassCertificate = (owner: { name: string; source: string }) =>
  directOwners.get(ownerKey(owner))
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
  const metadata = subclassProficiencyDigest(subclassProficiencyMetadata(source))
  return (
    !feature.featureOptionSourceConflict &&
    Array.isArray(feature.entries) &&
    getClassFeatureIdentity(feature) === rule.target &&
    Object.keys(feature).every((key) => rule.fields.includes(key)) &&
    getFeatureSourceDigest(feature.entries, false) === rule.digest &&
    metadata != null &&
    (metadata === rule.metadataDigest || metadata === rule.bundledMetadataDigest)
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
    classData.sourceIdentityConflict ||
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
