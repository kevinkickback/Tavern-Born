import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import { GIANT_POWER_TARGET } from './barbarianPathChoiceIdentity'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  collectSubclassProficiencyPaths,
  getSubclassCopyLookupKey,
  getSubclassProficiencyDeclarations,
  getSubclassProficiencyEntries,
  getSubclassProficiencyOwner,
  isArcaneArcherLoreProficiencyFeature,
  isExactSubclassProficiencyReference,
  isKnightlyEnvoyProficiencyFeature,
  type SubclassProficiencyFeatureCertificate,
  type SubclassProficiencyPackage,
  type SubclassProficiencyRootCertificate,
  type SubclassProficiencySourceAudit,
  subclassProficiencyDigest,
  subclassProficiencyFeatureDigest,
  subclassProficiencyMetadata,
  subclassProficiencyRootDigest,
} from './subclassProficiencyCertificates'
import {
  isConditionalOnlySubclassProficiencyTarget,
  SUBCLASS_PROFICIENCY_CHECKPOINT,
  SUBCLASS_PROFICIENCY_PACKAGES,
} from './subclassProficiencyRegistry'

const certificates = SUBCLASS_PROFICIENCY_CHECKPOINT
const features = new Map(certificates.features.map((row) => [row.target, row]))
const roots = new Map(certificates.roots.map((row) => [JSON.stringify(row.owner), row]))
const packagedRoots = new Map(
  SUBCLASS_PROFICIENCY_PACKAGES.flatMap((source) => source.roots).map((row) => [
    JSON.stringify(row.owner),
    row,
  ]),
)
const packagedFeatures = new Map(
  SUBCLASS_PROFICIENCY_PACKAGES.flatMap((source) => source.features).map((row) => [
    row.target,
    row,
  ]),
)
interface RawPackage {
  source: SubclassProficiencyPackage
  key: string
}
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
  packageKey?: string,
): SubclassProficiencySourceAudit => ({
  version: 1,
  certificate: subclassProficiencyDigest(certificate)!,
  origin,
  verified,
  ...(packageKey ? { package: packageKey } : {}),
})
const isStamped = (
  value: unknown,
  certificate: unknown,
  packageKey?: string,
): value is SubclassProficiencySourceAudit => {
  if (!value || typeof value !== 'object') return false
  const audit = value as SubclassProficiencySourceAudit
  return (
    audit.version === 1 &&
    audit.verified === true &&
    typeof audit.origin === 'string' &&
    !!audit.origin &&
    audit.certificate === subclassProficiencyDigest(certificate) &&
    audit.package === packageKey &&
    Object.keys(audit).every((key) =>
      ['version', 'certificate', 'origin', 'verified', ...(packageKey ? ['package'] : [])].includes(
        key,
      ),
    )
  )
}

/** Recognize complete raw packages before enrichment or layer composition can fill missing links. */
export function auditSubclassProficiencyPackages(
  classes: readonly Record<string, unknown>[],
  rawRoots: readonly Record<string, unknown>[],
  rawFeatures: readonly Record<string, unknown>[],
  origin: string,
): RawPackage[] {
  const packages: RawPackage[] = []
  for (const source of SUBCLASS_PROFICIENCY_PACKAGES) {
    const members: Record<string, unknown>[] = []
    const verify = (rows: Record<string, unknown>[], digest: string) => {
      if (rows.length !== 1 || subclassProficiencyDigest(rows[0]) !== digest) return false
      members.push(rows[0])
      return true
    }
    if (
      !source.roots.every((root) => {
        const parents = classes.filter(
          (cls) =>
            typeof cls.name === 'string' &&
            cls.name.trim().toLowerCase() === root.owner[0] &&
            typeof cls.source === 'string' &&
            cls.source.trim().toLowerCase() === root.owner[1],
        )
        return (
          parents.length === 1 &&
          !parents[0]._copy &&
          !parents[0].sourceIdentityConflict &&
          verify(
            rawRoots.filter((row) => same(getSubclassProficiencyOwner(row), root.owner)),
            root.rawDigest,
          )
        )
      }) ||
      !source.features.every((feature) =>
        verify(
          rawFeatures.filter((row) => getSubclassFeatureIdentity(row) === feature.target),
          feature.rawDigest,
        ),
      )
    )
      continue
    const key = subclassProficiencyDigest([origin, members])
    if (key) packages.push({ source, key })
  }
  return packages
}

/** Audit all raw occurrences, even roots whose mutated declaration removed every supported leaf. */
export function auditSubclassProficiencyRoots(
  raw: Record<string, unknown>[],
  materialized: Record<string, unknown>[],
  origin: string,
  packages: readonly RawPackage[],
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
    const owner = JSON.stringify(getSubclassProficiencyOwner(row))
    const matching = packages.filter(({ source }) =>
      source.roots.some((root) => JSON.stringify(root.owner) === owner),
    )
    const packageAudit = matching.length === 1 ? matching[0] : undefined
    const packaged = packageAudit?.source.roots.find((root) => JSON.stringify(root.owner) === owner)
    const ordinary = roots.get(owner)
    const certificate = packaged ?? ordinary ?? packagedRoots.get(owner)
    if (!certificate) return row
    const producers = byOwner.get(JSON.stringify(certificate.owner)) ?? []
    const valid =
      !!(ordinary || packaged) &&
      producers.length === 1 &&
      subclassProficiencyRootDigest(raw[index]) === certificate.rawDigest &&
      subclassProficiencyDigest(subclassProficiencyMetadata(row, true)) ===
        certificate.metadataDigest &&
      certificate.copies.every((copy) => {
        const matches = byCopy.get(copy.key) ?? []
        return (
          matches.length === 1 &&
          (byOwner.get(JSON.stringify(getSubclassProficiencyOwner(matches[0]))) ?? []).length ===
            1 &&
          subclassProficiencyRootDigest(matches[0]) === copy.digest
        )
      })
    return {
      ...row,
      subclassProficiencySourceAudit: stamp(
        certificate,
        `${origin}:subclass:${index}`,
        valid,
        packaged && packageAudit?.key,
      ),
    }
  })
}

/** Resolve copies first, then preserve raw multiplicity/closure before reference first-match enrichment. */
export function auditSubclassProficiencyFeatures(
  raw: Record<string, unknown>[],
  materialized: Record<string, unknown>[],
  origin: string,
  packages: readonly RawPackage[],
) {
  const byTarget = new Map<string, Record<string, unknown>[]>()
  raw.forEach((row) => {
    const target = getSubclassFeatureIdentity(row)
    if (target) byTarget.set(target, [...(byTarget.get(target) ?? []), row])
  })
  return materialized.map((row, index) => {
    const target = getSubclassFeatureIdentity(row) ?? ''
    const matching = packages.filter(({ source }) =>
      source.features.some((feature) => feature.target === target),
    )
    const packageAudit = matching.length === 1 ? matching[0] : undefined
    const packaged = packageAudit?.source.features.find((feature) => feature.target === target)
    const ordinary = features.get(target)
    const certificate = packaged ?? ordinary ?? packagedFeatures.get(target)
    if (!certificate) return row
    const producers = byTarget.get(target) ?? []
    const valid =
      !!(ordinary || packaged) &&
      producers.length === 1 &&
      subclassProficiencyFeatureDigest(raw[index]) === certificate.rawDigest &&
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
        packaged && packageAudit?.key,
      ),
      // Independently checked spells should survive a changed proficiency clause.
      ...(!valid &&
      !(
        (target === GIANT_POWER_TARGET ||
          isKnightlyEnvoyProficiencyFeature(row) ||
          isArcaneArcherLoreProficiencyFeature(row)) &&
        ordinary &&
        producers.length === 1 &&
        !raw[index]._copy
      ) &&
      !isConditionalOnlySubclassProficiencyTarget(target)
        ? { featureOptionSourceConflict: true }
        : {}),
    }
  })
}

function currentFeatureMatches(
  feature: SubclassFeature,
  certificate: SubclassProficiencyFeatureCertificate,
  packageKey?: string,
) {
  if (
    feature.featureOptionSourceConflict ||
    !isStamped(feature.subclassProficiencySourceAudit, certificate, packageKey) ||
    Object.keys(feature).some(
      (key) => !certificate.fields.includes(key) && !featureDerived.includes(key),
    ) ||
    subclassProficiencyDigest(subclassProficiencyMetadata(feature)) !==
      certificate.metadataDigest ||
    !Array.isArray(feature.entries)
  )
    return false
  let cursor = 0
  for (const entry of getSubclassProficiencyEntries(feature)) {
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
function resolveSubclassProficiencyFeature(
  target: string,
  candidates: readonly SubclassFeature[],
  packageSource?: SubclassProficiencyPackage,
  packageKey?: string,
) {
  const certificate = packageSource
    ? packageSource.features.find((feature) => feature.target === target)
    : features.get(target)
  if (
    !certificate ||
    !candidates.length ||
    candidates.some(
      (feature) =>
        getSubclassFeatureIdentity(feature) !== target ||
        !currentFeatureMatches(feature, certificate, packageKey),
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
  classData: Pick<Class5e, 'name' | 'source' | 'sourceIdentityConflict'>,
  subclass: Subclass5e,
  candidates: ReadonlyMap<string, readonly SubclassFeature[]>,
  includeFixedOnly = false,
): SubclassProficiencyRootCertificate | undefined {
  const owner = JSON.stringify(getSubclassProficiencyOwner(subclass))
  const packageKey = subclass.subclassProficiencySourceAudit?.package
  const packageSource = packageKey
    ? SUBCLASS_PROFICIENCY_PACKAGES.find((source) =>
        source.roots.some(
          (root) =>
            JSON.stringify(root.owner) === owner &&
            isStamped(subclass.subclassProficiencySourceAudit, root, packageKey),
        ),
      )
    : undefined
  const certificate =
    packageSource?.roots.find((root) => JSON.stringify(root.owner) === owner) ?? roots.get(owner)
  if (
    !certificate ||
    (packageSource?.fixedOnly && !includeFixedOnly) ||
    certificate.owner[0] !== classData.name.trim().toLowerCase() ||
    certificate.owner[1] !== classData.source.trim().toLowerCase() ||
    (packageSource && classData.sourceIdentityConflict) ||
    !isStamped(subclass.subclassProficiencySourceAudit, certificate, packageSource && packageKey) ||
    subclass.shortName !== certificate.shortName ||
    Object.keys(subclass).some(
      (key) => !certificate.fields.includes(key) && !rootDerived.includes(key),
    ) ||
    subclassProficiencyDigest(subclassProficiencyMetadata(subclass, true)) !==
      certificate.metadataDigest ||
    subclass.introFeatureRef !== certificate.intro ||
    !Array.isArray(subclass.subclassFeatures) ||
    !orderedDeclarations(
      getSubclassProficiencyDeclarations<unknown>(subclass, subclass.subclassFeatures),
      getSubclassProficiencyDeclarations(subclass, certificate.declarations),
    ) ||
    !Array.isArray(subclass.subclassFeatureRefs) ||
    !orderedDeclarations(
      getSubclassProficiencyDeclarations(
        subclass,
        subclass.subclassFeatureRefs.map((ref) => ref.ref),
      ),
      getSubclassProficiencyDeclarations(subclass, certificate.declarations),
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
  const resolveWitness = (target: string, rows: readonly SubclassFeature[]) =>
    resolveSubclassProficiencyFeature(target, rows, packageSource, packageKey)
  const resolve = (target: string) => resolveWitness(target, candidates.get(target) ?? [])
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
    !resolveWitness(introTarget, embedded.get(introTarget) ?? [])
  )
    return undefined
  const currentPaths = collectSubclassProficiencyPaths(
    subclass.subclassFeatureRefs,
    (target) => {
      const current = resolve(target)
      return current && resolveWitness(target, embedded.get(target) ?? []) ? current : undefined
    },
    packageSource ? (target, feature) => !!resolveWitness(target, [feature]) : undefined,
  )
  // A retained leaf cannot bypass its certified original intro or any enabling ancestor.
  const validPaths = certificate.paths.filter(
    (path) =>
      currentPaths.some((current) => same(current, path)) &&
      path.refs.every((uid) => {
        const target = getSubclassFeatureIdentity(decodeSubclassFeatureReference(uid))!
        return !!resolve(target) && !!resolveWitness(target, embedded.get(target) ?? [])
      }),
  )
  return validPaths.length ? { ...certificate, paths: validPaths } : undefined
}
