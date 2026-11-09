import type { Class5e, ClassFeature } from '@/types/5etools'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from './optionalClassDeclarationStructure'

const targetOf = (uid: unknown) =>
  typeof uid === 'string' ? decodeOptionalDeclaration(uid, 'classFeature')?.target : undefined

export function getCurrentDirectClassFeature(
  cls: Class5e,
  catalogs: ClassFeatureSourceCatalog,
  target: string,
  verify?: (feature: ClassFeature) => boolean,
  options?: { includeDisplayOnly: true },
) {
  if (cls.sourceIdentityConflict || cls._copy) return undefined
  const includeDisplayOnly = options?.includeDisplayOnly === true
  const declared = cls.classFeatures?.filter(
    (row) => (targetOf(row) ?? targetOf(optionalDeclarationObject(row).classFeature)) === target,
  )
  const declaration = declared?.length === 1 ? declared[0] : undefined
  const declarationRow = optionalDeclarationObject(declaration)
  const uid = typeof declaration === 'string' ? declaration : declarationRow.classFeature
  if (
    typeof uid !== 'string' ||
    targetOf(uid) !== target ||
    (!includeDisplayOnly &&
      (declarationRow.gainSubclassFeature || declarationRow.isClassFeatureVariant)) ||
    declarationRow.sourceIdentityConflict ||
    !exactOptionalDeclarationReference(declarationRow, uid, 'classFeature')
  )
    return undefined
  const refs = cls.classFeatureRefs?.filter(
    (row) => targetOf(row.ref) === target || getClassFeatureIdentity(row) === target,
  )
  const ref = refs?.length === 1 ? refs[0] : undefined
  const refRow = optionalDeclarationObject(ref)
  if (
    !ref?.feature ||
    ref.feature.sourceIdentityConflict ||
    refRow.sourceIdentityConflict ||
    (!includeDisplayOnly &&
      (ref.feature.isClassFeatureVariant ||
        refRow.isClassFeatureVariant ||
        ref.gainSubclassFeature)) ||
    (ref.gainSubclassFeature === true) !== (declarationRow.gainSubclassFeature === true) ||
    targetOf(ref.ref) !== target ||
    !exactOptionalDeclarationReference(refRow, ref.ref, 'classFeature') ||
    getClassFeatureIdentity(ref.feature) !== target ||
    (verify && !verify(ref.feature))
  )
    return undefined
  const rows = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(target)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  const feature = rows?.length === 1 ? rows[0] : undefined
  return feature &&
    !feature.sourceIdentityConflict &&
    (includeDisplayOnly || !feature.isClassFeatureVariant) &&
    getClassFeatureIdentity(feature) === target &&
    (!verify || verify(feature))
    ? feature
    : undefined
}
