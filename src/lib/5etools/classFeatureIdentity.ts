import type { ClassFeatureReference, SubclassFeatureReference } from '@/types/5etools'

interface ClassFeatureIdentityInput {
  name?: unknown
  className?: unknown
  classSource?: unknown
  level?: unknown
  source?: unknown
}

interface SubclassFeatureIdentityInput extends ClassFeatureIdentityInput {
  subclassShortName?: unknown
  subclassSource?: unknown
}

function sourceKey(value: unknown, fallback: string): string | undefined {
  if (value === undefined) return fallback
  return typeof value === 'string' ? value.trim().toLowerCase() || fallback : undefined
}

/** DataUtil.class UID defaults from pinned 5etools e5d0520; display text is not identity. */
export function decodeClassFeatureReference(uid: string): ClassFeatureReference {
  const [name = '', className = '', classSourcePart, levelPart, sourcePart] = uid
    .split('|')
    .map((part) => part.trim())
  const classSource = classSourcePart || 'PHB'
  const level = Number(levelPart)
  return {
    ref: uid,
    name,
    className,
    classSource,
    source: sourcePart || classSource,
    ...(Number.isInteger(level) && level > 0 ? { level } : {}),
  }
}

function normalizeClassFeatureIdentity(feature: ClassFeatureIdentityInput) {
  const name = typeof feature.name === 'string' ? feature.name.trim().toLowerCase() : ''
  const className =
    typeof feature.className === 'string' ? feature.className.trim().toLowerCase() : ''
  const classSource = sourceKey(feature.classSource, 'phb')
  const source = classSource ? sourceKey(feature.source, classSource) : undefined
  if (
    !name ||
    !className ||
    !classSource ||
    !source ||
    typeof feature.level !== 'number' ||
    !Number.isInteger(feature.level) ||
    feature.level <= 0
  )
    return undefined
  return { name, className, classSource, level: feature.level, source }
}

/** A class-feature target must agree with every encoded identity field. */
export function getClassFeatureIdentity(feature: ClassFeatureIdentityInput): string | undefined {
  const identity = normalizeClassFeatureIdentity(feature)
  return identity
    ? [
        'class-feature',
        identity.name,
        identity.className,
        identity.classSource,
        identity.level,
        identity.source,
      ].join('|')
    : undefined
}

/** Compatibility matching requires a unique catalog target for this canonical name/source. */
export function getClassFeatureLegacyLookupKey(
  feature: ClassFeatureIdentityInput,
): string | undefined {
  const identity = normalizeClassFeatureIdentity(feature)
  return identity ? `${identity.name}|${identity.source}` : undefined
}

/** Encoded identity is authoritative; only rows without a UID use materialized levels. */
export function getClassFeatureReferenceLevel(
  ref: Pick<ClassFeatureReference, 'ref' | 'level' | 'feature'>,
): number | undefined {
  if (typeof ref.ref === 'string' && ref.ref.trim()) {
    const decoded = decodeClassFeatureReference(ref.ref)
    return getClassFeatureIdentity(decoded) ? decoded.level : undefined
  }
  if (ref.ref !== undefined && typeof ref.ref !== 'string') return undefined
  const level = ref.level !== undefined ? ref.level : ref.feature?.level
  return typeof level === 'number' && Number.isInteger(level) && level > 0 ? level : undefined
}

/** Subclass UIDs have their own field order and PHB defaults in DataUtil.class. */
export function decodeSubclassFeatureReference(uid: string): SubclassFeatureReference {
  const [
    name = '',
    className = '',
    classSource,
    subclassShortName = '',
    subclassSource,
    level,
    source,
  ] = uid.split('|').map((part) => part.trim())
  const gainLevel = Number(level)
  return {
    ref: uid,
    name,
    className,
    classSource: classSource || 'PHB',
    subclassShortName,
    subclassSource: subclassSource || 'PHB',
    source: source || subclassSource || 'PHB',
    ...(Number.isInteger(gainLevel) && gainLevel > 0 ? { level: gainLevel } : {}),
  }
}

export function getSubclassFeatureIdentity(
  feature: SubclassFeatureIdentityInput,
): string | undefined {
  const subclassShortName =
    typeof feature.subclassShortName === 'string'
      ? feature.subclassShortName.trim().toLowerCase()
      : ''
  const subclassSource = sourceKey(feature.subclassSource, 'phb')
  const identity = normalizeClassFeatureIdentity({
    ...feature,
    source: sourceKey(feature.source, subclassSource ?? 'phb'),
  })
  return identity && subclassShortName && subclassSource
    ? [
        'subclass-feature',
        identity.name,
        identity.className,
        identity.classSource,
        subclassShortName,
        subclassSource,
        identity.level,
        identity.source,
      ].join('|')
    : undefined
}

/** Never repair a malformed encoded subclass level with materialized metadata. */
export function getSubclassFeatureReferenceLevel(
  ref: Pick<SubclassFeatureReference, 'ref' | 'level' | 'feature'>,
): number | undefined {
  if (typeof ref.ref === 'string' && ref.ref.trim()) {
    const decoded = decodeSubclassFeatureReference(ref.ref)
    return getSubclassFeatureIdentity(decoded) ? decoded.level : undefined
  }
  if (ref.ref !== undefined && typeof ref.ref !== 'string') return undefined
  const level = ref.level !== undefined ? ref.level : ref.feature?.level
  return typeof level === 'number' && Number.isInteger(level) && level > 0 ? level : undefined
}
