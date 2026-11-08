import { CopyResolutionError, resolveCopiedRecords } from './copyResolution'
import { asArray } from './parsers/shared'
import { getSubclassCopyLookupKey } from './subclassProficiencyCertificates'

type SourceRecord = Record<string, unknown>
const object = (value: unknown): SourceRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as SourceRecord) : {}

/** Keep the production one-level subclass inheritance behavior shared with development tooling. */
export function materializeSubclassCopies(subclasses: readonly unknown[]): SourceRecord[] {
  const byIdentity = new Map<string, SourceRecord[]>()
  for (const value of subclasses) {
    const record = object(value)
    const key = getSubclassCopyLookupKey(record)
    if (key) byIdentity.set(key, [...(byIdentity.get(key) ?? []), record])
  }
  return subclasses.map((value) => {
    const record = object(value)
    const key = getSubclassCopyLookupKey(object(record._copy))
    const matches = key ? byIdentity.get(key) : undefined
    if (matches && matches.length > 1) return { ...record, sourceIdentityConflict: true }
    const base = matches?.[0]
    return base
      ? {
          ...base,
          ...record,
          ...(base.sourceIdentityConflict === true ? { sourceIdentityConflict: true } : {}),
        }
      : record
  })
}

/** The same copy preparation feeds both parser audits and development-time certificates. */
export function materializeSubclassFeatureCopies(
  records: SourceRecord[],
  dependencies: SourceRecord[] = [],
): SourceRecord[] {
  if (!records.some((record) => Object.getOwnPropertyDescriptor(record, '_copy'))) return records
  const resolved = resolveCopiedRecords(
    [...records, ...dependencies] as Array<SourceRecord & { name: string; source: string }>,
    'subclassFeature',
  )
  if (resolved.diagnostics.length)
    throw new CopyResolutionError(resolved.diagnostics, 'in subclass features')
  return resolved.records.slice(0, records.length)
}

/** Like upstream DataUtil.pLoadByMeta, dependency IDs resolve through the class index. */
export function createIndexedSubclassFeatureResolver(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
): (file: string) => SourceRecord[] {
  const indexedFiles = object(index)
  const prepared = new Map<string, SourceRecord[]>()
  const active = new Set<string>()

  function resolve(file: string): SourceRecord[] {
    const existing = prepared.get(file)
    if (existing) return existing
    if (active.has(file)) throw new Error(`Cyclic subclass-feature dependency: ${file}`)

    const document = object(documents.get(file))
    const records = asArray(document.subclassFeature).map(object)
    const dependencyIds = object(object(document._meta).dependencies).subclassFeature
    if (
      dependencyIds === undefined ||
      !records.some((row) => Object.getOwnPropertyDescriptor(row, '_copy'))
    ) {
      const result = materializeSubclassFeatureCopies(records)
      prepared.set(file, result)
      return result
    }
    if (!Array.isArray(dependencyIds))
      throw new Error(`Invalid subclass-feature dependencies: ${file}`)

    active.add(file)
    try {
      const dependencyFiles = new Set<string>()
      for (const id of dependencyIds) {
        const path =
          typeof id === 'string' && Object.getOwnPropertyDescriptor(indexedFiles, id)?.value
        if (typeof path !== 'string' || !documents.has(path.trim()))
          throw new Error(`Unavailable indexed subclass-feature dependency in ${file}`)
        dependencyFiles.add(path.trim())
      }
      const result = materializeSubclassFeatureCopies(
        records,
        [...dependencyFiles].flatMap(resolve),
      )
      prepared.set(file, result)
      return result
    } finally {
      active.delete(file)
    }
  }

  return resolve
}
