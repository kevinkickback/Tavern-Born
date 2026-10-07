import type { ClassFeatureReference } from '@/types/5etools'

interface ClassFeatureIdentityInput {
  name?: unknown
  className?: unknown
  classSource?: unknown
  level?: unknown
  source?: unknown
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

/** A class-feature target must agree with every encoded identity field. */
export function getClassFeatureIdentity(feature: ClassFeatureIdentityInput): string | undefined {
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
  return ['class-feature', name, className, classSource, feature.level, source].join('|')
}
