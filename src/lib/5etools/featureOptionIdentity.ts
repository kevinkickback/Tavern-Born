import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'

export type FeatureOptionParentKind = 'classFeature' | 'subclassFeature'

export interface FeatureOptionTarget {
  kind: FeatureOptionParentKind
  parentRef: string
  parentIdentity: string
  table: string
  row: string
  source: string
}

export function normalizeFeatureOptionPart(value: string): string {
  return value.trim().toLowerCase()
}

/** Packed parent UIDs retain their complete target independently of the selected owner. */
export function canonicalFeatureOptionParent(ref: string, kind: FeatureOptionParentKind) {
  if (ref.split('|').length !== (kind === 'classFeature' ? 5 : 7)) return undefined
  const parent =
    kind === 'classFeature' ? decodeClassFeatureReference(ref) : decodeSubclassFeatureReference(ref)
  const identity =
    kind === 'classFeature' ? getClassFeatureIdentity(parent) : getSubclassFeatureIdentity(parent)
  return identity
    ? { ref: identity.split('|').slice(1).join('|'), identity, source: parent.source! }
    : undefined
}

/** Validates a saved literal intent without requiring its source rules to be loaded. */
export function decodeFeatureOptionReference(option: {
  name: string
  source?: string
  ref?: string
}): FeatureOptionTarget | undefined {
  if (typeof option.ref !== 'string' || typeof option.name !== 'string') return undefined
  try {
    const parts: unknown = JSON.parse(option.ref)
    if (
      !Array.isArray(parts) ||
      parts.length !== 4 ||
      !parts.every((part) => typeof part === 'string') ||
      (parts[0] !== 'classFeature' && parts[0] !== 'subclassFeature')
    )
      return undefined
    const [kind, packed, tableLabel, rowLabel] = parts as [
      FeatureOptionParentKind,
      string,
      string,
      string,
    ]
    const parent = canonicalFeatureOptionParent(packed, kind)
    const table = normalizeFeatureOptionPart(tableLabel)
    const row = normalizeFeatureOptionPart(rowLabel)
    if (
      !parent ||
      !table ||
      !row ||
      normalizeFeatureOptionPart(option.name) !== row ||
      (option.source !== undefined &&
        (typeof option.source !== 'string' ||
          (option.source.trim() &&
            normalizeFeatureOptionPart(option.source) !==
              normalizeFeatureOptionPart(parent.source))))
    )
      return undefined
    return {
      kind,
      parentRef: parent.ref,
      parentIdentity: parent.identity,
      table,
      row,
      source: parent.source,
    }
  } catch {
    return undefined
  }
}

export function getFeatureOptionKey(option: {
  name: string
  source?: string
  ref?: string
}): string | undefined {
  const target = decodeFeatureOptionReference(option)
  return target
    ? `feature-option:${JSON.stringify([target.kind, target.parentRef, target.table, target.row])}`
    : undefined
}

export function getFeatureOptionChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  parentIdentity: string,
  table: string,
  level: number,
): string {
  const ownerKey = [
    owner.name,
    owner.source,
    owner.subclassName ?? '',
    owner.subclassSource ?? '',
  ].map(normalizeFeatureOptionPart)
  return `feature-table:${encodeURIComponent(JSON.stringify([ownerKey, parentIdentity, table, level]))}`
}

export function encodeFeatureOptionReference(
  parent: { kind: FeatureOptionParentKind; ref: string },
  table: string,
  row: string,
): string {
  const canonical = canonicalFeatureOptionParent(parent.ref, parent.kind)
  if (!canonical) throw new RangeError('A feature option requires a complete parent target.')
  return JSON.stringify([
    parent.kind,
    canonical.ref,
    normalizeFeatureOptionPart(table),
    normalizeFeatureOptionPart(row),
  ])
}
