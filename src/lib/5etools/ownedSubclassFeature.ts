import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationDigest,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { collectSubclassProficiencyPaths } from './subclassProficiencyCertificates'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

type SubclassCatalog = {
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

export function getDeclaredSubclassGains(cls: Pick<Class5e, 'classFeatures' | 'classFeatureRefs'>) {
  const declarations = cls.classFeatureRefs?.filter((ref) => ref.gainSubclassFeature === true) ?? []
  const raw = (cls.classFeatures ?? []).filter(
    (value) => record(value).gainSubclassFeature === true,
  )
  return declarations.flatMap((ref) => {
    const parsed = decodeOptionalDeclaration(ref.ref, 'classFeature')
    const level = parsed?.decoded.level
    if (
      !parsed ||
      level === undefined ||
      !ref.feature ||
      ref.feature.sourceIdentityConflict ||
      getClassFeatureIdentity(ref.feature) !== parsed.target ||
      !exactOptionalDeclarationReference(record(ref), ref.ref, 'classFeature')
    )
      return []
    const atLevel = raw.filter(
      (value) =>
        typeof record(value).classFeature === 'string' &&
        decodeOptionalDeclaration(record(value).classFeature as string, 'classFeature')?.decoded
          .level === level,
    )
    const declaration = record(atLevel[0])
    const reference = declaration.classFeature
    return atLevel.length === 1 &&
      typeof reference === 'string' &&
      !declaration.sourceIdentityConflict &&
      !declaration.isClassFeatureVariant &&
      decodeOptionalDeclaration(reference, 'classFeature')?.target === parsed.target &&
      exactOptionalDeclarationReference(declaration, reference, 'classFeature')
      ? [level]
      : []
  })
}

/** Resolve an exact reachable declaration while keeping selected and printed owners separate. */
export function getOwnedSubclassFeature(
  cls: Class5e,
  subclass: Subclass5e,
  target: string,
  catalogs?: SubclassCatalog,
) {
  if (
    cls._copy ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    !findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return undefined
  const gains = getDeclaredSubclassGains(cls)
  const refs = (subclass.subclassFeatureRefs ?? []).filter((ref) => {
    const decoded = decodeOptionalDeclaration(ref.ref, 'subclassFeature')
    return !!decoded && getDirectSubclassFeatureReference(subclass, decoded.target) === ref
  })
  const valid = (key: string, feature: SubclassFeature) =>
    getSubclassFeatureIdentity(feature) === key &&
    !!feature.source?.trim() &&
    !!feature.classSource?.trim() &&
    !!feature.subclassSource?.trim() &&
    !feature._copy &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant
  const attached = collectUnconditionalFeatureReferences(refs, 'subclassFeature')
  const resolve = (key: string) => {
    const candidates = catalogs
      ? (catalogs.subclassFeatureCandidates?.get(key) ??
        catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === key))
      : attached.flatMap((row) =>
          row.target === key && row.reference.feature
            ? [row.reference.feature as SubclassFeature]
            : [],
        )
    const [first] = candidates
    const signature = first && optionalDeclarationDigest(first)
    return signature &&
      candidates.every((row) => valid(key, row) && optionalDeclarationDigest(row) === signature)
      ? first
      : undefined
  }
  const paths = collectSubclassProficiencyPaths(refs, resolve, (key, feature) => {
    const current = resolve(key)
    return (
      !!current &&
      valid(key, feature) &&
      optionalDeclarationDigest(current) === optionalDeclarationDigest(feature)
    )
  }).filter((row) => row.target === target)
  const [path] = paths
  const feature = paths.length === 1 && resolve(target)
  const rootLevel =
    path && decodeOptionalDeclaration(path.refs[0], 'subclassFeature')?.decoded.level
  return feature && rootLevel && gains.filter((level) => level === rootLevel).length === 1
    ? { feature, level: path.level, target, refs: path.refs }
    : undefined
}
