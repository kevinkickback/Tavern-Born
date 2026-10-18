import type { ClassFeature, ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import type { FeatureOptionParentKind } from './featureOptionIdentity'

type FeatureReference = ClassFeatureReference | SubclassFeatureReference

export interface UnconditionalFeatureReference {
  reference: FeatureReference
  kind: FeatureOptionParentKind
  target: string
  level: number
}

/** Collects retained declarations at their enclosing earned level, excluding unselected options. */
export function collectUnconditionalFeatureReferences(
  refs: readonly FeatureReference[],
  kind: FeatureOptionParentKind,
): UnconditionalFeatureReference[] {
  const result: UnconditionalFeatureReference[] = []
  const bestLevel = new Map<object, number>()
  const decode = (ref: string, targetKind: FeatureOptionParentKind) =>
    targetKind === 'classFeature'
      ? decodeClassFeatureReference(ref)
      : decodeSubclassFeatureReference(ref)
  const identity = (
    feature: FeatureReference | ClassFeature,
    targetKind: FeatureOptionParentKind,
  ) =>
    targetKind === 'classFeature'
      ? getClassFeatureIdentity(feature)
      : getSubclassFeatureIdentity(feature)
  const visit = (
    reference: FeatureReference,
    targetKind: FeatureOptionParentKind,
    enclosing: number,
  ) => {
    if (typeof reference.ref !== 'string' || !reference.ref.trim()) return
    const decoded = decode(reference.ref, targetKind)
    const target = identity(decoded, targetKind)
    if (!target || decoded.level === undefined) return
    const level = Math.max(enclosing, decoded.level)
    result.push({ reference, kind: targetKind, target, level })
    const feature = reference.feature
    if (!feature || identity(feature, targetKind) !== target) return
    const previous = bestLevel.get(feature)
    if (previous !== undefined && previous <= level) return
    bestLevel.set(feature, level)
    const seen = new Set<object>()
    const scan = (value: unknown) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return
      seen.add(value)
      if (Array.isArray(value)) {
        value.forEach(scan)
        return
      }
      const record = value as Record<string, unknown>
      if (record.type === 'options') return
      const nestedKind =
        record.type === 'refSubclassFeature'
          ? 'subclassFeature'
          : record.type === 'refClassFeature'
            ? 'classFeature'
            : undefined
      if (nestedKind && typeof record[nestedKind] === 'string') {
        visit(
          {
            ...decode(record[nestedKind], nestedKind),
            feature: record.feature as FeatureReference['feature'],
          },
          nestedKind,
          level,
        )
        return
      }
      scan(record.entries)
    }
    scan(feature.entries)
  }
  for (const reference of refs) visit(reference, kind, 0)
  return result
}
