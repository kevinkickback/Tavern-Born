import type { Class5e, Subclass5e } from '@/types/5etools'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export const NATIVE_DRACONIC_SUBCLASSES = {
  phb: {
    name: 'Draconic Bloodline',
    source: 'phb',
    wings: 'subclass-feature|dragon wings|sorcerer|phb|draconic|phb|14|phb',
  },
  xphb: {
    name: 'Draconic Sorcery',
    source: 'xphb',
    wings: 'subclass-feature|dragon wings|sorcerer|xphb|draconic|xphb|14|xphb',
  },
} as const

export function getNativeWingsSubclass(target: string | undefined) {
  const { phb, xphb } = NATIVE_DRACONIC_SUBCLASSES
  if (target === phb.wings) return phb
  if (target === xphb.wings) return xphb
}

export function findNativeDraconicSubclass(
  cls: Class5e,
  owner: (typeof NATIVE_DRACONIC_SUBCLASSES)[keyof typeof NATIVE_DRACONIC_SUBCLASSES],
) {
  const subclasses = cls.subclasses?.filter((row) => findClassReference(owner, [row]))
  const subclass = subclasses?.[0]
  if (
    subclasses?.length === 1 &&
    subclass &&
    !subclass.sourceIdentityConflict &&
    !('_copy' in subclass) &&
    typeof subclass.shortName === 'string' &&
    subclass.shortName.trim().toLowerCase() === 'draconic' &&
    findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return subclass
}

export function getDirectDraconicFeatureReference(subclass: Subclass5e, target: string) {
  if (!Array.isArray(subclass.subclassFeatures) || !Array.isArray(subclass.subclassFeatureRefs))
    return undefined
  const matchesUid = (uid: unknown) =>
    typeof uid === 'string' && decodeOptionalDeclaration(uid, 'subclassFeature')?.target === target
  const declarations = subclass.subclassFeatures.filter((row) =>
    matchesUid(typeof row === 'string' ? row : record(row).subclassFeature),
  )
  const refs = subclass.subclassFeatureRefs.filter(
    (row) => matchesUid(row.ref) || getSubclassFeatureIdentity(row) === target,
  )
  const ref = refs[0]
  if (
    declarations.length === 1 &&
    typeof declarations[0] === 'string' &&
    refs.length === 1 &&
    ref &&
    !ref.sourceIdentityConflict &&
    !record(ref).isClassFeatureVariant &&
    matchesUid(ref.ref) &&
    exactOptionalDeclarationReference(record(ref), ref.ref, 'subclassFeature')
  )
    return ref
}
