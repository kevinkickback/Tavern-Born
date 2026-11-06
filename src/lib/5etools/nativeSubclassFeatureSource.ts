import type { Class5e, Subclass5e } from '@/types/5etools'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export interface NativeSubclassOwner {
  className: string
  name: string
  source: string
  shortName: string
}

export function findNativeSubclass(cls: Class5e, owner: NativeSubclassOwner) {
  if (!findClassReference({ name: owner.className, source: owner.source }, [cls])) return undefined
  const subclasses = cls.subclasses?.filter((row) => findClassReference(owner, [row]))
  const subclass = subclasses?.[0]
  if (
    subclasses?.length === 1 &&
    subclass &&
    !subclass.sourceIdentityConflict &&
    !('_copy' in subclass) &&
    typeof subclass.shortName === 'string' &&
    subclass.shortName.trim().toLowerCase() === owner.shortName &&
    findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return subclass
}

export function getDirectSubclassFeatureReference(subclass: Subclass5e, target: string) {
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
