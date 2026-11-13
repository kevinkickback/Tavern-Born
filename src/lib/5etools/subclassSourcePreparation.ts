import { getUnnamedRankedExpansion } from './additionalSpells'
import { getSubclassOwnerIdentity } from './classFeatureIdentity'
import { CopyResolutionError, resolveCopiedRecords } from './copyResolution'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { asArray } from './parsers/shared'
import {
  getSubclassCopyIdentity,
  getSubclassCopyLookupKey,
} from './subclassProficiencyCertificates'

type SourceRecord = Record<string, unknown>
const object = (value: unknown): SourceRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as SourceRecord) : {}
const hasCopy = (row: SourceRecord) => !!Object.getOwnPropertyDescriptor(row, '_copy')

/** Keep the production one-level subclass inheritance behavior shared with development tooling. */
export function materializeSubclassCopies(
  subclasses: readonly unknown[],
  scope?: { dependencies: readonly unknown[]; allowLocal: boolean },
): SourceRecord[] {
  const byIdentity = new Map<string, SourceRecord[]>()
  const ownerCounts = new Map<string, number>()
  const getKey = scope
    ? (row: SourceRecord) => {
        const identity = getSubclassCopyIdentity(row)
        return identity && JSON.stringify(identity)
      }
    : getSubclassCopyLookupKey
  const local = !scope || scope.allowLocal ? subclasses : []
  for (const value of [...local, ...(scope?.dependencies ?? [])]) {
    const record = object(value)
    const key = getKey(record)
    if (key) byIdentity.set(key, [...(byIdentity.get(key) ?? []), record])
    const owner = getSubclassOwnerIdentity(record)
    if (owner) {
      const ownerKey = JSON.stringify(owner)
      ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) ?? 0) + 1)
    }
  }
  return subclasses.map((value) => {
    const { retainedExpandedSpellSourceDigest: _, ...record } = object(value)
    const key = getKey(object(record._copy))
    const matches = key ? byIdentity.get(key) : undefined
    if (scope && hasCopy(record) && (matches?.length !== 1 || hasCopy(matches[0])))
      throw new CopyResolutionError(
        [
          {
            entity: String(record.name),
            reason: `Missing, ambiguous, or copied subclass parent ${key ?? ''}`,
          },
        ],
        'in subclasses',
      )
    if (matches && matches.length > 1) return { ...record, sourceIdentityConflict: true }
    const base = matches?.[0]
    if (!base) return record
    const { retainedExpandedSpellSourceDigest: _base, ...original } = base
    const expansion =
      record.classSource === 'XPHB' &&
      original.classSource === 'PHB' &&
      !hasCopy(original) &&
      !original.sourceIdentityConflict &&
      ownerCounts.get(JSON.stringify(getSubclassOwnerIdentity(original))) === 1 &&
      JSON.stringify(getSubclassCopyIdentity(original)) ===
        JSON.stringify(getSubclassCopyIdentity(object(record._copy))) &&
      !Object.getOwnPropertyDescriptor(record, 'additionalSpells')
        ? getUnnamedRankedExpansion(original.additionalSpells)
        : undefined
    return {
      ...original,
      ...record,
      ...(original.sourceIdentityConflict === true ? { sourceIdentityConflict: true } : {}),
      ...(expansion
        ? { retainedExpandedSpellSourceDigest: getFeatureSourceDigest([expansion], false) }
        : {}),
    }
  })
}

/** The same copy preparation feeds both parser audits and development-time certificates. */
export function materializeSubclassFeatureCopies(
  records: SourceRecord[],
  loadDependencies?: () => SourceRecord[],
): SourceRecord[] {
  if (!records.some(hasCopy)) return records
  const scope = loadDependencies ? [...records, ...loadDependencies()] : records
  const resolved = resolveCopiedRecords(
    scope as Array<SourceRecord & { name: string; source: string }>,
    'subclassFeature',
  )
  if (resolved.diagnostics.length)
    throw new CopyResolutionError(resolved.diagnostics, 'in subclass features')
  return resolved.records.slice(0, records.length)
}

type IndexedCopyCollection = 'class' | 'subclass' | 'subclassFeature'

export function getIndexedClassDependencyFiles(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
  file: string,
  collection: IndexedCopyCollection,
) {
  const dependencyIds = object(object(object(documents.get(file))._meta).dependencies)[collection]
  if (dependencyIds === undefined) return []
  if (!Array.isArray(dependencyIds)) throw new Error(`Invalid class dependencies: ${file}`)
  const dependencyFiles = new Set<string>()
  for (const id of dependencyIds) {
    const path = typeof id === 'string' && Object.getOwnPropertyDescriptor(object(index), id)?.value
    if (typeof path !== 'string' || !documents.has(path.trim()))
      throw new Error(`Unavailable class dependency in ${file}`)
    dependencyFiles.add(path.trim())
  }
  return [...dependencyFiles]
}

/** Like upstream DataUtil.pLoadByMeta, dependency IDs resolve through the class index. */
function createIndexedCopyResolver(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
  collection: IndexedCopyCollection,
  materialize: (
    records: SourceRecord[],
    loadDependencies: () => SourceRecord[],
    metadata: SourceRecord,
  ) => SourceRecord[],
): (file: string) => SourceRecord[] {
  const prepared = new Map<string, SourceRecord[] | null>()

  function resolve(file: string): SourceRecord[] {
    const existing = prepared.get(file)
    if (existing) return existing
    if (existing === null) throw new Error(`Cyclic ${collection} dependency: ${file}`)

    const document = object(documents.get(file))
    const records = asArray(document[collection]).map(object)
    const metadata = object(document._meta)
    prepared.set(file, null)
    try {
      const result = materialize(
        records,
        () => getIndexedClassDependencyFiles(index, documents, file, collection).flatMap(resolve),
        metadata,
      )
      prepared.set(file, result)
      return result
    } catch (error) {
      prepared.delete(file)
      throw error
    }
  }

  return resolve
}

export function createIndexedSubclassFeatureResolver(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
): (file: string) => SourceRecord[] {
  return createIndexedCopyResolver(
    index,
    documents,
    'subclassFeature',
    materializeSubclassFeatureCopies,
  )
}

export function createIndexedClassResolver(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
): (file: string) => SourceRecord[] {
  return createIndexedCopyResolver(
    index,
    documents,
    'class',
    (records, loadDependencies, metadata) => {
      if (!records.some(hasCopy)) return records
      const dependencies = loadDependencies()
      const resolveCopies = (local: SourceRecord[]) => {
        const resolved = resolveCopiedRecords(
          [...local, ...dependencies] as Array<SourceRecord & { name: string; source: string }>,
          'class',
        )
        if (resolved.diagnostics.length)
          throw new CopyResolutionError(resolved.diagnostics, 'in classes')
        return resolved.records.slice(0, local.length)
      }
      if (asArray(metadata.internalCopies).includes('class')) return resolveCopies(records)
      return records.map((row) => (hasCopy(row) ? resolveCopies([row])[0] : row))
    },
  )
}

export function createIndexedSubclassResolver(
  index: unknown,
  documents: ReadonlyMap<string, unknown>,
): (file: string) => SourceRecord[] {
  return createIndexedCopyResolver(
    index,
    documents,
    'subclass',
    (records, loadDependencies, metadata) =>
      records.some(hasCopy)
        ? materializeSubclassCopies(records, {
            dependencies: loadDependencies(),
            allowLocal: asArray(metadata.internalCopies).includes('subclass'),
          })
        : records,
  )
}
