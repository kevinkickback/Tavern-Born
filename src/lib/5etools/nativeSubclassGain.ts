import type { Class5e } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from './optionalClassDeclarationStructure'

function readGainDeclaration(cls: Class5e, ref: Record<string, unknown>, uid: unknown) {
  if (
    typeof uid !== 'string' ||
    ref.sourceIdentityConflict ||
    ref.isClassFeatureVariant ||
    !exactOptionalDeclarationReference(ref, uid, 'classFeature')
  )
    return undefined
  const declaration = decodeOptionalDeclaration(uid, 'classFeature')
  if (!declaration) return undefined
  return declaration.target ===
    getClassFeatureIdentity({
      ...declaration.decoded,
      className: cls.name,
      classSource: cls.source,
      source: cls.source,
    })
    ? declaration
    : undefined
}

export function matchesNativeSubclassGain(
  cls: Class5e,
  target: string,
  level: number,
  position: 'first' | 'at-level' = 'first',
): boolean {
  if (
    cls.sourceIdentityConflict ||
    '_copy' in cls ||
    !Array.isArray(cls.classFeatures) ||
    !Array.isArray(cls.classFeatureRefs)
  )
    return false
  const rawGains = cls.classFeatures
    .map(optionalDeclarationObject)
    .filter((ref) => ref.gainSubclassFeature === true)
  const declarations = rawGains.map((ref) => readGainDeclaration(cls, ref, ref.classFeature))
  const rawIndex =
    position === 'first' ? 0 : declarations.findIndex((ref) => ref?.target === target)
  const raw = rawGains[rawIndex]
  if (
    !raw ||
    declarations[rawIndex]?.target !== target ||
    declarations.some((ref) => !ref) ||
    ('gainSubclassFeatureHasContent' in raw && raw.gainSubclassFeatureHasContent !== true) ||
    Object.keys(raw).some(
      (key) =>
        ![
          'classFeature',
          'gainSubclassFeature',
          'gainSubclassFeatureHasContent',
          'name',
          'source',
          'className',
          'classSource',
          'level',
        ].includes(key),
    ) ||
    declarations.filter((ref) => ref?.decoded.level === level).length !== 1
  )
    return false

  const gains = cls.classFeatureRefs.filter((ref) => ref.gainSubclassFeature === true)
  const refs = gains.map((ref) => readGainDeclaration(cls, optionalDeclarationObject(ref), ref.ref))
  const parsedIndex = position === 'first' ? 0 : refs.findIndex((ref) => ref?.target === target)
  const gain = gains[parsedIndex]
  return (
    refs[parsedIndex]?.target === target &&
    !refs.some((ref) => !ref) &&
    refs.filter((ref) => ref?.decoded.level === level).length === 1 &&
    (!gain.feature ||
      (!gain.feature.sourceIdentityConflict && getClassFeatureIdentity(gain.feature) === target))
  )
}

/** Resolve an authored first or later subclass gain from the exact class declaration. */
export function getCurrentNativeSubclassGain(cls: Class5e, level?: number) {
  const ref = cls.classFeatureRefs?.find(
    (row) => row.gainSubclassFeature === true && (level === undefined || row.level === level),
  )
  if (!ref || ref.level === undefined) return undefined
  const target = getClassFeatureIdentity(ref)
  return target &&
    matchesNativeSubclassGain(cls, target, ref.level, level === undefined ? 'first' : 'at-level')
    ? ref
    : undefined
}
