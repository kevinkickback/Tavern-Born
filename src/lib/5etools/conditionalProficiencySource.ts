import type { OptionalFeatureLike } from '@/types/5etools'
import {
  CONDITIONAL_OPTIONAL_CERTIFICATES,
  type ConditionalOptionalCertificate,
} from './conditionalProficiencyRules'
import { getEntityLookupKey } from './lookups'
import { subclassProficiencyDigest } from './subclassProficiencyCertificates'

type Audit = NonNullable<OptionalFeatureLike['conditionalProficiencySourceAudit']>
const FIELD = 'conditionalProficiencySourceAudit'
const certificates = new Map(CONDITIONAL_OPTIONAL_CERTIFICATES.map((row) => [row.target, row]))
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
/** The existing optional-feature option key, requiring both actual source fields. */
export function getConditionalOptionalIdentity(value: unknown): string | undefined {
  const row = object(value)
  return row &&
    typeof row.name === 'string' &&
    row.name.trim() &&
    typeof row.source === 'string' &&
    row.source.trim()
    ? `optionalFeature|${getEntityLookupKey(row.name, row.source).toLowerCase()}`
    : undefined
}
const stamp = (
  certificate: ConditionalOptionalCertificate,
  origin: string,
  verified: boolean,
): Audit => ({ version: 1, certificate: subclassProficiencyDigest(certificate)!, origin, verified })
function auditOf(value: unknown, certificate: ConditionalOptionalCertificate): Audit | undefined {
  const audit = object(object(value)?.[FIELD])
  return audit &&
    Object.keys(audit).every((key) =>
      ['version', 'certificate', 'origin', 'verified'].includes(key),
    ) &&
    audit.version === 1 &&
    audit.verified === true &&
    audit.certificate === subclassProficiencyDigest(certificate) &&
    typeof audit.origin === 'string' &&
    !!audit.origin
    ? (audit as unknown as Audit)
    : undefined
}
function currentMatches(value: unknown, certificate: ConditionalOptionalCertificate) {
  const row = object(value)
  if (
    !row ||
    getConditionalOptionalIdentity(row) !== certificate.target ||
    !auditOf(row, certificate)
  )
    return false
  const { [FIELD]: _audit, ...source } = row
  return (
    Object.keys(source).every((key) => certificate.fields.includes(key)) &&
    subclassProficiencyDigest(source) === certificate.digest
  )
}
/** Raw multiplicity and body/shape are checked before any lookup or layer Map can choose a row. */
export function auditConditionalOptionalFeatures(
  records: readonly unknown[],
  origin: string,
): unknown[] {
  const groups = new Map<string, unknown[]>()
  for (const row of records) {
    const target = getConditionalOptionalIdentity(row)
    if (target && certificates.has(target)) groups.set(target, [...(groups.get(target) ?? []), row])
  }
  return records.map((value, index) => {
    const row = object(value),
      target = getConditionalOptionalIdentity(row),
      certificate = target && certificates.get(target)
    if (!row || !certificate) return value
    const verified =
      (groups.get(certificate.target) ?? []).length === 1 &&
      !Object.getOwnPropertyDescriptor(row, FIELD) &&
      Object.keys(row).every((key) => certificate.fields.includes(key)) &&
      subclassProficiencyDigest(row) === certificate.digest
    return { ...row, [FIELD]: stamp(certificate, `${origin}:optionalFeature:${index}`, verified) }
  })
}
/** Distinct winning-layer producers cannot borrow an agreeing enrichment mirror's stamp. */
export function auditConditionalOptionalLayerMultiplicity(records: readonly unknown[]): unknown[] {
  const groups = new Map<string, unknown[]>()
  for (const row of records) {
    const key = getConditionalOptionalIdentity(row)
    if (key && certificates.has(key)) groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const invalid = new Set<string>()
  for (const [target, rows] of groups) {
    const certificate = certificates.get(target)!
    const origins = new Set(rows.map((row) => auditOf(row, certificate)?.origin ?? row))
    if (
      rows.length > 1 &&
      (origins.size !== 1 || rows.some((row) => !currentMatches(row, certificate)))
    )
      invalid.add(target)
  }
  return records.map((value) => {
    const target = getConditionalOptionalIdentity(value)
    if (!target || !invalid.has(target)) return value
    const row = object(value)!,
      certificate = certificates.get(target)!
    return {
      ...row,
      [FIELD]: stamp(certificate, auditOf(row, certificate)?.origin ?? 'ambiguous-layer', false),
    }
  })
}
interface CurrentOptionalCatalog {
  optionalFeatures?: readonly OptionalFeatureLike[]
  optionalFeatureCandidates?: ReadonlyMap<string, readonly OptionalFeatureLike[]>
}
const cache = new WeakMap<object, ReadonlyMap<string, OptionalFeatureLike | undefined>>()
/** Explicit candidate indexes, including empty indexes, are authoritative for a catalog revision. */
export function getConditionalOptionalSources(
  catalogs: CurrentOptionalCatalog | undefined,
): ReadonlyMap<string, OptionalFeatureLike | undefined> {
  if (!catalogs) return new Map()
  const listed = catalogs.optionalFeatures
  if (!listed) return new Map()
  const old = cache.get(catalogs)
  if (old) return old
  const result = new Map<string, OptionalFeatureLike | undefined>()
  for (const [target, certificate] of certificates) {
    const rows =
      catalogs.optionalFeatureCandidates !== undefined
        ? (catalogs.optionalFeatureCandidates.get(target) ?? [])
        : (catalogs.optionalFeatures?.filter(
            (row) => getConditionalOptionalIdentity(row) === target,
          ) ?? [])
    const present = listed.filter((row) => getConditionalOptionalIdentity(row) === target)
    const all = [...rows, ...present]
    const origins = new Set(all.map((row) => auditOf(row, certificate)?.origin))
    result.set(
      target,
      rows.length &&
        present.length &&
        origins.size === 1 &&
        all.every((row) => currentMatches(row, certificate))
        ? rows[0]
        : undefined,
    )
  }
  cache.set(catalogs, result)
  return result
}
