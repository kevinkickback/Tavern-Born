import { CopyResolutionError, resolveCopiedRecords } from './copyResolution'
import { getSubclassCopyLookupKey } from './subclassProficiencyCertificates'

type SourceRecord = Record<string, unknown>
const object = (value: unknown): SourceRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as SourceRecord) : {}

/** Keep the production one-level subclass inheritance behavior shared with development tooling. */
export function materializeSubclassCopies(subclasses: readonly unknown[]): SourceRecord[] {
  const byIdentity = new Map<string, SourceRecord>()
  for (const value of subclasses) {
    const record = object(value)
    const key = getSubclassCopyLookupKey(record)
    if (key && !byIdentity.has(key)) byIdentity.set(key, record)
  }
  return subclasses.map((value) => {
    const record = object(value)
    const key = getSubclassCopyLookupKey(object(record._copy))
    const base = key ? byIdentity.get(key) : undefined
    return base ? { ...base, ...record } : record
  })
}

/** The same copy preparation feeds both parser audits and development-time certificates. */
export function materializeSubclassFeatureCopies(records: SourceRecord[]): SourceRecord[] {
  if (!records.some((record) => Object.getOwnPropertyDescriptor(record, '_copy'))) return records
  const resolved = resolveCopiedRecords(
    records as Array<SourceRecord & { name: string; source: string }>,
    'subclassFeature',
  )
  if (resolved.diagnostics.length)
    throw new CopyResolutionError(resolved.diagnostics, 'in subclass features')
  return resolved.records
}
