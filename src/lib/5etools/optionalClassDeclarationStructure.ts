import type { ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  getSubclassCopyLookupKey,
  getSubclassProficiencyOwner,
} from './subclassProficiencyCertificates'
import {
  materializeSubclassCopies,
  materializeSubclassFeatureCopies,
} from './subclassSourcePreparation'

export type OptionalDeclarationOwner =
  | ['class', string, string]
  | ['subclass', string, string, string, string]
export type OptionalDeclarationKind = 'classFeature' | 'subclassFeature'
type Row = Record<string, unknown>
interface OptionalDeclarationStep {
  kind: OptionalDeclarationKind
  target: string
  uid: string
}
export interface OptionalDeclarationCertificate {
  owner: OptionalDeclarationOwner
  target: string
  level: number
  path: OptionalDeclarationStep[]
  parentMetadata: Row
  parentRaw: unknown[]
  features: Array<{ kind: OptionalDeclarationKind; target: string; body: Row; raw: unknown[] }>
}
export type OptionalDeclarationBodyShape =
  | { digest: string }
  | {
      metadataDigest: string
      fields: string[]
      reference?: string
      entries:
        | { kind: 'absent' }
        | { kind: 'array'; values: OptionalDeclarationBodyShape[] }
        | { kind: 'other'; digest: string }
    }
export interface OptionalDeclarationRule {
  owner: OptionalDeclarationOwner
  target: string
  level: number
  path: OptionalDeclarationStep[]
  certificate: string
  parentMetadataDigest: string
  parentFields: string[]
  rootValues: unknown[]
  features: Array<{
    kind: OptionalDeclarationKind
    target: string
    body: OptionalDeclarationBodyShape
  }>
}
export const optionalDeclarationObject = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(optionalDeclarationObject) : []
const norm = (value: unknown) => (typeof value === 'string' ? value.trim().toLowerCase() : '')
export const optionalDeclarationDigest = (value: unknown) => getFeatureSourceDigest([value], false)
export const optionalDeclarationKey = (
  owner: OptionalDeclarationOwner,
  target: string,
  level: number,
) => JSON.stringify([owner, target, level])
export function getOptionalDeclarationOwner(
  row: Row,
  kind: 'class' | 'subclass',
): OptionalDeclarationOwner | undefined {
  if (kind === 'subclass') {
    const owner = getSubclassProficiencyOwner(row)
    return owner ? ['subclass', ...owner] : undefined
  }
  return norm(row.name) && norm(row.source)
    ? ['class', norm(row.name), norm(row.source)]
    : undefined
}
export function decodeOptionalDeclaration(uid: string, kind: OptionalDeclarationKind) {
  const count = uid.split('|').length
  if (kind === 'classFeature' ? count < 4 || count > 5 : count < 6 || count > 7) return undefined
  const decoded =
    kind === 'classFeature' ? decodeClassFeatureReference(uid) : decodeSubclassFeatureReference(uid)
  const target =
    kind === 'classFeature' ? getClassFeatureIdentity(decoded) : getSubclassFeatureIdentity(decoded)
  return target && decoded.level && decoded.level <= 20 ? { decoded, target } : undefined
}
export function exactOptionalDeclarationReference(
  row: Row,
  uid: string,
  kind: OptionalDeclarationKind,
) {
  const parsed = decodeOptionalDeclaration(uid, kind)
  if (!parsed) return false
  const decoded = parsed.decoded as unknown as Row
  return [
    'name',
    'className',
    'classSource',
    'level',
    'source',
    ...(kind === 'subclassFeature' ? ['subclassShortName', 'subclassSource'] : []),
  ].every(
    (field) =>
      row[field] === undefined ||
      (typeof decoded[field] === 'number'
        ? row[field] === decoded[field]
        : typeof row[field] === 'string' && norm(row[field]) === norm(decoded[field])),
  )
}
const parentDerived = new Set([
  'classFeatures',
  'subclassFeatures',
  'subclasses',
  'classFeatureRefs',
  'subclassFeatureRefs',
  'introFeatureRef',
  'levelFeatures',
  'normalizedRules',
  'isSpellcaster',
  'spellSlotProgression',
  'fluffEntries',
  'classFluffSections',
  'classFluffImages',
  'subclassProficiencySourceAudit',
  'fixedProficiencySourceAudit',
])
export function optionalDeclarationParentMetadata(
  row: Row,
  kind: 'class' | 'subclass',
  expected?: Row,
) {
  const declaration = kind === 'class' ? 'classFeatures' : 'subclassFeatures'
  return Object.fromEntries(
    Object.entries(row).filter(
      ([key]) =>
        key !== declaration &&
        !(
          expected &&
          !Object.getOwnPropertyDescriptor(expected, key) &&
          (parentDerived.has(key) || (kind === 'subclass' && key === 'entries'))
        ),
    ),
  )
}
function rootUid(value: unknown, kind: OptionalDeclarationKind) {
  if (typeof value === 'string') return value
  const row = optionalDeclarationObject(value)
  return typeof row[kind] === 'string' ? (row[kind] as string) : undefined
}
function scopedParent(row: Row, kind: 'class' | 'subclass', first: OptionalDeclarationStep) {
  const field = kind === 'class' ? 'classFeatures' : 'subclassFeatures'
  const value = row[field]
  return {
    metadata: optionalDeclarationParentMetadata(row, kind),
    declarations: !Object.getOwnPropertyDescriptor(row, field)
      ? 'absent'
      : Array.isArray(value)
        ? 'array'
        : 'other',
    matches: Array.isArray(value)
      ? value.filter((value) => {
          const uid = rootUid(value, first.kind)
          return uid && decodeOptionalDeclaration(uid, first.kind)?.target === first.target
        })
      : value,
  }
}
/** Production copy preparation is shared; certificate scopes never include unrelated declarations. */
export interface PreparedOptionalDeclarationSources {
  subclasses: Record<string, unknown>[]
  subclassFeatures: Record<string, unknown>[]
}
export function collectOptionalDeclarationCertificates(
  document: unknown,
  optionalTargets: ReadonlySet<string>,
  prepared?: PreparedOptionalDeclarationSources,
): OptionalDeclarationCertificate[] {
  const data = optionalDeclarationObject(document)
  const rawClasses = rows(data.class),
    rawSubclasses = rows(data.subclass)
  const subclasses = prepared?.subclasses ?? materializeSubclassCopies(rawSubclasses)
  const rawFeatures = {
    classFeature: rows(data.classFeature),
    subclassFeature: rows(data.subclassFeature),
  }
  const features = {
    classFeature: rawFeatures.classFeature,
    subclassFeature:
      prepared?.subclassFeatures ?? materializeSubclassFeatureCopies(rawFeatures.subclassFeature),
  }
  const identity = (row: Row, kind: OptionalDeclarationKind) =>
    kind === 'classFeature' ? getClassFeatureIdentity(row) : getSubclassFeatureIdentity(row)
  const index = (values: typeof features) =>
    Object.fromEntries(
      (['classFeature', 'subclassFeature'] as const).map((kind) => {
        const targets = new Map<string, Row[]>()
        for (const row of values[kind]) {
          const key = identity(row, kind)
          if (key) targets.set(key, [...(targets.get(key) ?? []), row])
        }
        return [kind, targets]
      }),
    ) as Record<OptionalDeclarationKind, Map<string, Row[]>>
  const rawIndex = index(rawFeatures),
    currentIndex = index(features)
  const matches = (target: string, kind: OptionalDeclarationKind, raw = false) =>
    (raw ? rawIndex : currentIndex)[kind].get(target) ?? []
  const rawClosure = (
    target: string,
    kind: OptionalDeclarationKind,
    seen = new Set<string>(),
  ): unknown[] => {
    if (seen.has(target)) return [{ cycle: target }]
    const found = matches(target, kind, true)
    return found.map((row) => {
      const copy = optionalDeclarationObject(row._copy)
      const parent =
        kind === 'subclassFeature' && row._copy ? getSubclassFeatureIdentity(copy) : undefined
      return {
        target,
        row,
        ...(row._copy
          ? { parent: parent ? rawClosure(parent, kind, new Set([...seen, target])) : [] }
          : {}),
      }
    })
  }
  const result: OptionalDeclarationCertificate[] = []
  const walkOwner = (parent: Row, ownerKind: 'class' | 'subclass') => {
    const owner = getOptionalDeclarationOwner(parent, ownerKind)
    if (!owner) return
    const kind: OptionalDeclarationKind = ownerKind === 'class' ? 'classFeature' : 'subclassFeature'
    const visit = (
      uid: string,
      kind: OptionalDeclarationKind,
      reference: Row,
      path: OptionalDeclarationStep[],
      earned: number,
    ) => {
      const parsed = decodeOptionalDeclaration(uid, kind)
      if (
        !parsed ||
        !exactOptionalDeclarationReference(reference, uid, kind) ||
        path.some((step) => step.target === parsed.target)
      )
        return
      const step = { kind, target: parsed.target, uid },
        next = [...path, step]
      const level = Math.max(earned, parsed.decoded.level!)
      if (optionalTargets.has(parsed.target)) {
        const first = next[0]
        const rawOwners = (ownerKind === 'class' ? rawClasses : rawSubclasses).filter(
          (row) =>
            JSON.stringify(getOptionalDeclarationOwner(row, ownerKind)) === JSON.stringify(owner),
        )
        const parentRaw = rawOwners.map((row) => {
          const key =
            ownerKind === 'subclass'
              ? getSubclassCopyLookupKey(optionalDeclarationObject(row._copy))
              : undefined
          const copies = key
            ? rawSubclasses
                .filter((candidate) => getSubclassCopyLookupKey(candidate) === key)
                .map((candidate) => ({
                  scope: scopedParent(candidate, ownerKind, first),
                  ownerMultiplicity: rawSubclasses.filter(
                    (other) =>
                      JSON.stringify(getOptionalDeclarationOwner(other, 'subclass')) ===
                      JSON.stringify(getOptionalDeclarationOwner(candidate, 'subclass')),
                  ).length,
                }))
            : []
          return { local: scopedParent(row, ownerKind, first), ...(row._copy ? { copies } : {}) }
        })
        result.push({
          owner,
          target: parsed.target,
          level,
          path: next,
          parentMetadata: optionalDeclarationParentMetadata(parent, ownerKind),
          parentRaw,
          features: next.map((step) => ({
            kind: step.kind,
            target: step.target,
            body:
              matches(step.target, step.kind).length === 1
                ? matches(step.target, step.kind)[0]
                : {},
            raw: rawClosure(step.target, step.kind),
          })),
        })
      }
      const found = matches(parsed.target, kind)
      if (found.length !== 1) return
      scanOptionalDeclarationReferences(found[0].entries, (uid, kind, row) =>
        visit(uid, kind, row, next, level),
      )
    }
    for (const value of Array.isArray(
      parent[ownerKind === 'class' ? 'classFeatures' : 'subclassFeatures'],
    )
      ? (parent[ownerKind === 'class' ? 'classFeatures' : 'subclassFeatures'] as unknown[])
      : []) {
      const uid = rootUid(value, kind)
      if (uid) visit(uid, kind, optionalDeclarationObject(value), [], 0)
    }
  }
  rawClasses.forEach((row) => {
    walkOwner(row, 'class')
  })
  subclasses.forEach((row) => {
    walkOwner(row, 'subclass')
  })
  return result.sort((a, b) =>
    optionalDeclarationKey(a.owner, a.target, a.level).localeCompare(
      optionalDeclarationKey(b.owner, b.target, b.level),
    ),
  )
}
/** Same retained entries traversal as collectUnconditionalFeatureReferences; options cannot declare grants. */
export function scanOptionalDeclarationReferences(
  value: unknown,
  visit: (uid: string, kind: OptionalDeclarationKind, row: Row) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((value) => {
      scanOptionalDeclarationReferences(value, visit)
    })
    return
  }
  if (!value || typeof value !== 'object') return
  const row = value as Row
  if (row.type === 'options') return
  const kind =
    row.type === 'refClassFeature'
      ? 'classFeature'
      : row.type === 'refSubclassFeature'
        ? 'subclassFeature'
        : undefined
  if (kind) {
    if (typeof row[kind] === 'string') visit(row[kind], kind, row)
    return
  }
  scanOptionalDeclarationReferences(row.entries, visit)
}
export type OptionalDeclarationReference = ClassFeatureReference | SubclassFeatureReference

/** Runtime certificates retain hashes/typed entry frames, not copies of complete corpus prose. */
function optionalDeclarationBodyShape(value: unknown): OptionalDeclarationBodyShape {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { digest: optionalDeclarationDigest(value)! }
  const row = value as Row
  const metadata = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'entries'))
  const kind =
    row.type === 'refClassFeature'
      ? 'classFeature'
      : row.type === 'refSubclassFeature'
        ? 'subclassFeature'
        : undefined
  const reference =
    kind &&
    typeof row[kind] === 'string' &&
    exactOptionalDeclarationReference(row, row[kind] as string, kind)
      ? decodeOptionalDeclaration(row[kind] as string, kind)?.target
      : undefined
  return {
    metadataDigest: optionalDeclarationDigest(metadata)!,
    fields: Object.keys(metadata).sort(),
    ...(reference ? { reference } : {}),
    entries: !Object.getOwnPropertyDescriptor(row, 'entries')
      ? { kind: 'absent' }
      : Array.isArray(row.entries)
        ? { kind: 'array', values: row.entries.map(optionalDeclarationBodyShape) }
        : { kind: 'other', digest: optionalDeclarationDigest(row.entries)! },
  }
}
export function summarizeOptionalDeclarationCertificate(
  value: OptionalDeclarationCertificate,
): OptionalDeclarationRule {
  const raw = value.parentRaw[0] as {
    local: { matches?: unknown[] }
    copies?: Array<{ scope: { matches?: unknown[] } }>
  }
  const rootValues = raw.local.matches?.length
    ? raw.local.matches
    : (raw.copies?.[0]?.scope.matches ?? [])
  return {
    owner: value.owner,
    target: value.target,
    level: value.level,
    path: value.path,
    certificate: optionalDeclarationDigest(value)!,
    parentMetadataDigest: optionalDeclarationDigest(value.parentMetadata)!,
    parentFields: Object.keys(value.parentMetadata).sort(),
    rootValues,
    features: value.features.map((feature) => ({
      kind: feature.kind,
      target: feature.target,
      body: optionalDeclarationBodyShape(feature.body),
    })),
  }
}
