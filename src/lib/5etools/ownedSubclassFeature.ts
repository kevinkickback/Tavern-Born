import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationDigest,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import {
  collectSubclassProficiencyPaths,
  isExactSubclassProficiencyReference,
} from './subclassProficiencyCertificates'
import { collectUnconditionalFeatureReferences } from './unconditionalFeatureReferences'

type SubclassCatalog = {
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

const validFeature = (key: string, feature: SubclassFeature) =>
  getSubclassFeatureIdentity(feature) === key &&
  !!feature.source?.trim() &&
  !!feature.classSource?.trim() &&
  !!feature.subclassSource?.trim() &&
  !feature._copy &&
  !feature.sourceIdentityConflict &&
  !feature.featureOptionSourceConflict &&
  !feature.isClassFeatureVariant

/** Verify a child of an already authorized, non-selection menu against its exact current source. */
export function getCurrentSubclassMenuReference(value: unknown, catalogs: SubclassCatalog) {
  const reference = record(value)
  const uid = reference.subclassFeature
  if (
    reference.type !== 'refSubclassFeature' ||
    typeof uid !== 'string' ||
    !isExactSubclassProficiencyReference(reference, uid) ||
    Object.keys(reference).some((key) => !['type', 'subclassFeature', 'feature'].includes(key))
  )
    return undefined
  const target = decodeOptionalDeclaration(uid, 'subclassFeature')?.target
  const attached = reference.feature as SubclassFeature | undefined
  if (!target || !attached || !validFeature(target, attached)) return undefined
  const candidates = catalogs.subclassFeatureCandidates
    ? (catalogs.subclassFeatureCandidates.get(target) ?? [])
    : catalogs.subclassFeatures.filter((feature) => getSubclassFeatureIdentity(feature) === target)
  const digest = optionalDeclarationDigest(attached)
  return digest &&
    candidates.length &&
    candidates.every(
      (feature) => validFeature(target, feature) && optionalDeclarationDigest(feature) === digest,
    )
    ? { target, feature: candidates[0] }
    : undefined
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

/** A copied class can still declare the exact native first gain under its printed UID. */
export function matchesRetainedFirstSubclassGain(cls: Class5e, target: string, level: number) {
  const first = cls.classFeatureRefs?.find((ref) => ref.gainSubclassFeature)
  return (
    !cls._copy &&
    !cls.sourceIdentityConflict &&
    first?.level === level &&
    getClassFeatureIdentity(first) === target &&
    getDeclaredSubclassGains(cls)[0] === level
  )
}

/** Resolve an exact reachable declaration while keeping selected and printed owners separate. */
function getOwnedSubclassFeatures(
  cls: Class5e,
  subclass: Subclass5e,
  catalogs?: SubclassCatalog,
  target?: string,
) {
  if (
    cls._copy ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    !findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return []
  const gains = getDeclaredSubclassGains(cls)
  const refs = (subclass.subclassFeatureRefs ?? []).filter((ref) => {
    const decoded = decodeOptionalDeclaration(ref.ref, 'subclassFeature')
    return !!decoded && getDirectSubclassFeatureReference(subclass, decoded.target) === ref
  })
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
      candidates.every(
        (row) => validFeature(key, row) && optionalDeclarationDigest(row) === signature,
      )
      ? first
      : undefined
  }
  const paths = collectSubclassProficiencyPaths(refs, resolve, (key, feature) => {
    const current = resolve(key)
    return (
      !!current &&
      validFeature(key, feature) &&
      optionalDeclarationDigest(current) === optionalDeclarationDigest(feature)
    )
  })
  const counts = new Map<string, number>()
  for (const path of paths) counts.set(path.target, (counts.get(path.target) ?? 0) + 1)
  return paths.flatMap((path) => {
    if ((target && path.target !== target) || counts.get(path.target) !== 1) return []
    const feature = resolve(path.target)
    const rootLevel = decodeOptionalDeclaration(path.refs[0], 'subclassFeature')?.decoded.level
    return feature && rootLevel && gains.filter((level) => level === rootLevel).length === 1
      ? [{ ...path, feature }]
      : []
  })
}

export function getOwnedSubclassFeature(
  cls: Class5e,
  subclass: Subclass5e,
  target: string,
  catalogs?: SubclassCatalog,
) {
  return getOwnedSubclassFeatures(cls, subclass, catalogs, target)[0]
}

/** Find the selected owner and its current scoped declarations without rewriting printed UIDs. */
export function getEarnedSubclassFeatureSource(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (
    !entry.subclass ||
    !permitsClassRuleSource(character, entry.subclassSource) ||
    !catalogs?.subclassTargets
  )
    return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const selected = cls?.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  if (!cls || selected?.length !== 1) return undefined
  const [subclass] = selected
  const key = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const scoped = scopeClassChoiceFeatureCatalogs(catalogs, key)
  const features = getOwnedSubclassFeatures(cls, subclass, scoped).filter(
    ({ level, refs }) =>
      level <= entry.levels &&
      refs.every((ref) => {
        const decoded = decodeOptionalDeclaration(ref, 'subclassFeature')?.decoded
        return (
          !!decoded &&
          'subclassSource' in decoded &&
          [decoded.classSource, decoded.subclassSource, decoded.source].every((source) =>
            permitsClassRuleSource(character, source),
          )
        )
      }),
  )
  return { cls, subclass, key, features, scoped }
}
