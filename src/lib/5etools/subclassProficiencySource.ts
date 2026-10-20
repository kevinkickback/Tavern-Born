import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  collectSubclassProficiencyPaths,
  getSubclassCopyLookupKey,
  getSubclassProficiencyOwner,
  isExactSubclassProficiencyReference,
  type SubclassProficiencyFeatureCertificate,
  type SubclassProficiencyRootCertificate,
  type SubclassProficiencySourceAudit,
  subclassProficiencyDigest,
  subclassProficiencyMetadata,
} from './subclassProficiencyCertificates'
import {
  isConditionalOnlySubclassProficiencyTarget,
  SUBCLASS_PROFICIENCY_CHECKPOINT,
} from './subclassProficiencyRegistry'

const certificates = SUBCLASS_PROFICIENCY_CHECKPOINT
const features = new Map(certificates.features.map((row) => [row.target, row]))
const roots = new Map(certificates.roots.map((row) => [JSON.stringify(row.owner), row]))
const rootDerived = [
  'entries',
  'subclassFeatureRefs',
  'introFeatureRef',
  'levelFeatures',
  'normalizedRules',
  'subclassProficiencySourceAudit',
]
const featureDerived = ['featureOptionSourceConflict', 'subclassProficiencySourceAudit']
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const stamp = (
  certificate: unknown,
  origin: string,
  verified: boolean,
): SubclassProficiencySourceAudit => ({
  version: 1,
  certificate: subclassProficiencyDigest(certificate)!,
  origin,
  verified,
})
const isStamped = (
  value: unknown,
  certificate: unknown,
): value is SubclassProficiencySourceAudit => {
  if (!value || typeof value !== 'object') return false
  const audit = value as SubclassProficiencySourceAudit
  return (
    audit.version === 1 &&
    audit.verified === true &&
    typeof audit.origin === 'string' &&
    !!audit.origin &&
    audit.certificate === subclassProficiencyDigest(certificate) &&
    Object.keys(audit).every((key) =>
      ['version', 'certificate', 'origin', 'verified'].includes(key),
    )
  )
}

/** Audit all raw occurrences, even roots whose mutated declaration removed every supported leaf. */
export function auditSubclassProficiencyRoots(
  raw: Record<string, unknown>[],
  materialized: Record<string, unknown>[],
  origin: string,
) {
  const byOwner = new Map<string, Record<string, unknown>[]>()
  const byCopy = new Map<string, Record<string, unknown>[]>()
  raw.forEach((row) => {
    const owner = JSON.stringify(getSubclassProficiencyOwner(row))
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), row])
    const key = getSubclassCopyLookupKey(row)
    if (key) byCopy.set(key, [...(byCopy.get(key) ?? []), row])
  })
  return materialized.map((row, index) => {
    const certificate = roots.get(JSON.stringify(getSubclassProficiencyOwner(row)))
    if (!certificate) return row
    const producers = byOwner.get(JSON.stringify(certificate.owner)) ?? []
    const valid =
      producers.length === 1 &&
      subclassProficiencyDigest(raw[index]) === certificate.rawDigest &&
      subclassProficiencyDigest(subclassProficiencyMetadata(row, true)) ===
        certificate.metadataDigest &&
      certificate.copies.every((copy) => {
        const matches = byCopy.get(copy.key) ?? []
        return (
          matches.length === 1 &&
          (byOwner.get(JSON.stringify(getSubclassProficiencyOwner(matches[0]))) ?? []).length ===
            1 &&
          subclassProficiencyDigest(matches[0]) === copy.digest
        )
      })
    return {
      ...row,
      subclassProficiencySourceAudit: stamp(certificate, `${origin}:subclass:${index}`, valid),
    }
  })
}

/** Resolve copies first, then preserve raw multiplicity/closure before reference first-match enrichment. */
export function auditSubclassProficiencyFeatures(
  raw: Record<string, unknown>[],
  materialized: Record<string, unknown>[],
  origin: string,
) {
  const byTarget = new Map<string, Record<string, unknown>[]>()
  raw.forEach((row) => {
    const target = getSubclassFeatureIdentity(row)
    if (target) byTarget.set(target, [...(byTarget.get(target) ?? []), row])
  })
  return materialized.map((row, index) => {
    const target = getSubclassFeatureIdentity(row) ?? ''
    const certificate = features.get(target)
    if (!certificate) return row
    const producers = byTarget.get(target) ?? []
    const valid =
      producers.length === 1 &&
      subclassProficiencyDigest(raw[index]) === certificate.rawDigest &&
      subclassProficiencyDigest(subclassProficiencyMetadata(row)) === certificate.metadataDigest &&
      certificate.copies.every((copy) => {
        const matches = byTarget.get(copy.target) ?? []
        return matches.length === 1 && subclassProficiencyDigest(matches[0]) === copy.digest
      })
    return {
      ...row,
      subclassProficiencySourceAudit: stamp(
        certificate,
        `${origin}:subclassFeature:${index}`,
        valid,
      ),
      ...(!valid && !isConditionalOnlySubclassProficiencyTarget(target)
        ? { featureOptionSourceConflict: true }
        : {}),
    }
  })
}

function currentFeatureMatches(
  feature: SubclassFeature,
  certificate: SubclassProficiencyFeatureCertificate,
) {
  if (
    feature.featureOptionSourceConflict ||
    !isStamped(feature.subclassProficiencySourceAudit, certificate) ||
    Object.keys(feature).some(
      (key) => !certificate.fields.includes(key) && !featureDerived.includes(key),
    ) ||
    subclassProficiencyDigest(subclassProficiencyMetadata(feature)) !==
      certificate.metadataDigest ||
    !Array.isArray(feature.entries)
  )
    return false
  let cursor = 0
  for (const entry of feature.entries) {
    const digest = getFeatureSourceDigest([entry])
    while (cursor < certificate.entries.length && certificate.entries[cursor].digest !== digest) {
      if (!certificate.entries[cursor].reference) return false
      cursor++
    }
    if (cursor === certificate.entries.length) return false
    cursor++
  }
  return certificate.entries.slice(cursor).every((entry) => !!entry.reference)
}

/** Enriched copies of one certified occurrence may agree; an extra raw occurrence never does. */
function resolveSubclassProficiencyFeature(target: string, candidates: readonly SubclassFeature[]) {
  const certificate = features.get(target)
  if (
    !certificate ||
    !candidates.length ||
    candidates.some(
      (feature) =>
        getSubclassFeatureIdentity(feature) !== target ||
        !currentFeatureMatches(feature, certificate),
    )
  )
    return undefined
  const origins = new Set(
    candidates.map((feature) => feature.subclassProficiencySourceAudit?.origin),
  )
  const bodies = new Set(candidates.map((feature) => getFeatureSourceDigest(feature.entries ?? [])))
  return origins.size === 1 && bodies.size === 1 ? candidates[0] : undefined
}

function orderedDeclarations(values: readonly unknown[], expected: readonly string[]) {
  let cursor = 0
  for (const value of values) {
    if (typeof value !== 'string') return false
    while (cursor < expected.length && expected[cursor] !== value) cursor++
    if (cursor === expected.length) return false
    cursor++
  }
  return true
}

/** Current filtered declarations are authoritative; retained detail bodies cannot repopulate an empty view. */
export function getCurrentSubclassProficiencyCertificate(
  classData: Pick<Class5e, 'name' | 'source'>,
  subclass: Subclass5e,
  candidates: ReadonlyMap<string, readonly SubclassFeature[]>,
): SubclassProficiencyRootCertificate | undefined {
  const certificate = roots.get(JSON.stringify(getSubclassProficiencyOwner(subclass)))
  if (
    !certificate ||
    certificate.owner[0] !== classData.name.trim().toLowerCase() ||
    certificate.owner[1] !== classData.source.trim().toLowerCase() ||
    !isStamped(subclass.subclassProficiencySourceAudit, certificate) ||
    subclass.shortName !== certificate.shortName ||
    Object.keys(subclass).some(
      (key) => !certificate.fields.includes(key) && !rootDerived.includes(key),
    ) ||
    subclassProficiencyDigest(subclassProficiencyMetadata(subclass, true)) !==
      certificate.metadataDigest ||
    subclass.introFeatureRef !== certificate.intro ||
    !Array.isArray(subclass.subclassFeatures) ||
    !orderedDeclarations(subclass.subclassFeatures, certificate.declarations) ||
    !Array.isArray(subclass.subclassFeatureRefs) ||
    !orderedDeclarations(
      subclass.subclassFeatureRefs.map((ref) => ref.ref),
      certificate.declarations,
    ) ||
    subclass.subclassFeatureRefs.some(
      (ref) =>
        !isExactSubclassProficiencyReference(ref as unknown as Record<string, unknown>, ref.ref) ||
        Object.keys(ref).some(
          (key) =>
            ![
              'ref',
              'name',
              'source',
              'className',
              'classSource',
              'subclassShortName',
              'subclassSource',
              'level',
              'feature',
            ].includes(key),
        ),
    )
  )
    return undefined
  const resolve = (target: string) =>
    resolveSubclassProficiencyFeature(target, candidates.get(target) ?? [])
  const embedded = new Map<string, SubclassFeature[]>()
  const visit = (feature: SubclassFeature | undefined) => {
    if (!feature) return
    const target = getSubclassFeatureIdentity(feature)
    if (!target) return
    const rows = embedded.get(target) ?? []
    if (rows.includes(feature)) return
    embedded.set(target, [...rows, feature])
    const scan = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach(scan)
        return
      }
      const entry = value as Record<string, unknown>
      if (entry.type === 'refSubclassFeature' && entry.feature)
        visit(entry.feature as SubclassFeature)
      if (entry.type !== 'options') scan(entry.entries)
    }
    scan(feature.entries)
  }
  for (const ref of subclass.subclassFeatureRefs) visit(ref.feature)
  const introTarget = getSubclassFeatureIdentity(decodeSubclassFeatureReference(certificate.intro))!
  if (
    subclass.subclassFeatures.filter((ref) => ref === certificate.intro).length !== 1 ||
    subclass.subclassFeatureRefs.filter((ref) => ref.ref === certificate.intro).length !== 1 ||
    !resolve(introTarget) ||
    !resolveSubclassProficiencyFeature(introTarget, embedded.get(introTarget) ?? [])
  )
    return undefined
  const currentPaths = collectSubclassProficiencyPaths(subclass.subclassFeatureRefs, (target) => {
    const current = resolve(target)
    return current && resolveSubclassProficiencyFeature(target, embedded.get(target) ?? [])
      ? current
      : undefined
  })
  // A retained leaf cannot bypass its certified original intro or any enabling ancestor.
  const validPaths = certificate.paths.filter(
    (path) =>
      currentPaths.some((current) => same(current, path)) &&
      path.refs.every((uid) => {
        const target = getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))!
        return (
          !!resolve(target) &&
          !!resolveSubclassProficiencyFeature(target, embedded.get(target) ?? [])
        )
      }),
  )
  return validPaths.length ? { ...certificate, paths: validPaths } : undefined
}
