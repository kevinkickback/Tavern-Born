import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'

export type FeatureOptionParentKind = 'classFeature' | 'subclassFeature'
export interface FeatureOptionTarget {
  format?: undefined
  kind: FeatureOptionParentKind
  parentRef: string
  parentIdentity: string
  table: string
  row: string
  source: string
}
export interface SourceGroupOptionTarget {
  format: 'source-group'
  kind: FeatureOptionParentKind
  parentRef: string
  parentIdentity: string
  group: string
  literal: string
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
/** Both source tables and explicitly discriminated literal groups retain offline structural identity. */
export function decodeFeatureOptionReference(option: {
  name: string
  source?: string
  ref?: string
}): FeatureOptionTarget | SourceGroupOptionTarget | undefined {
  if (typeof option.ref !== 'string' || typeof option.name !== 'string') return undefined
  try {
    const parts: unknown = JSON.parse(option.ref)
    if (!Array.isArray(parts) || !parts.every((part) => typeof part === 'string')) return undefined
    const literal = parts.length === 5 && parts[0] === 'source-group'
    if (
      (!literal && parts.length !== 4) ||
      !['classFeature', 'subclassFeature'].includes(parts[literal ? 1 : 0])
    )
      return undefined
    const [kind, packed, groupLabel, valueLabel] = (literal ? parts.slice(1) : parts) as [
      FeatureOptionParentKind,
      string,
      string,
      string,
    ]
    const parent = canonicalFeatureOptionParent(packed, kind)
    const group = normalizeFeatureOptionPart(groupLabel)
    const value = normalizeFeatureOptionPart(valueLabel)
    if (
      !parent ||
      !group ||
      !value ||
      normalizeFeatureOptionPart(option.name) !== value ||
      (option.source !== undefined &&
        (typeof option.source !== 'string' ||
          (option.source.trim() &&
            normalizeFeatureOptionPart(option.source) !==
              normalizeFeatureOptionPart(parent.source))))
    )
      return undefined
    const common = {
      kind,
      parentRef: parent.ref,
      parentIdentity: parent.identity,
      source: parent.source,
    }
    return literal
      ? { ...common, format: 'source-group', group, literal: value }
      : { ...common, table: group, row: value }
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
  if (!target) return undefined
  return target.format === 'source-group'
    ? `feature-literal:${JSON.stringify([target.kind, target.parentRef, target.group, target.literal])}`
    : `feature-option:${JSON.stringify([target.kind, target.parentRef, target.table, target.row])}`
}
function ownerKey(owner: {
  name: string
  source: string
  subclassName?: string
  subclassSource?: string
}): string[] {
  return [owner.name, owner.source, owner.subclassName ?? '', owner.subclassSource ?? ''].map(
    normalizeFeatureOptionPart,
  )
}
export function getFeatureOptionChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  parentIdentity: string,
  table: string,
  level: number,
): string {
  return `feature-table:${encodeURIComponent(JSON.stringify([ownerKey(owner), parentIdentity, table, level]))}`
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
export function encodeSourceGroupOptionReference(
  parent: { kind: FeatureOptionParentKind; ref: string },
  group: string,
  literal: string,
): string {
  const canonical = canonicalFeatureOptionParent(parent.ref, parent.kind)
  if (!canonical) throw new RangeError('A source literal requires a complete parent target.')
  return JSON.stringify([
    'source-group',
    parent.kind,
    canonical.ref,
    normalizeFeatureOptionPart(group),
    normalizeFeatureOptionPart(literal),
  ])
}
export const isFeatureLiteralChoiceId = (id: string) => id.startsWith('feature-literals:')
export function getFeatureLiteralChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  pool: string,
  group: string,
  grant: string,
  level: number,
): string {
  return `feature-literals:${encodeURIComponent(JSON.stringify([ownerKey(owner), pool, group, grant, level]))}`
}
export function decodeFeatureLiteralChoiceId(
  id: string,
): { owner: string[]; pool: string; group: string; grant: string; level: number } | undefined {
  if (!isFeatureLiteralChoiceId(id)) return undefined
  try {
    const parts: unknown = JSON.parse(decodeURIComponent(id.slice('feature-literals:'.length)))
    if (!Array.isArray(parts) || parts.length !== 5) return undefined
    const [owner, pool, group, grant, level] = parts
    return Array.isArray(owner) &&
      owner.length === 4 &&
      owner.every((part) => typeof part === 'string') &&
      owner[0].trim() &&
      owner[1].trim() &&
      [pool, group, grant].every((part) => typeof part === 'string' && part.trim()) &&
      typeof level === 'number' &&
      Number.isInteger(level) &&
      level > 0 &&
      level <= 20
      ? { owner, pool, group, grant, level }
      : undefined
  } catch {
    return undefined
  }
}
