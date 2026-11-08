import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { SubclassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  getDirectSubclassFeatureReference,
  getNativeSubclassIntroFeature,
  isInheritedClassicSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'

export function getCurrentRangerFeatures(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const owners = character.classProgression.filter((entry) => norm(entry.name) === 'ranger')
  const owner = owners[0]
  const classes = owner && catalogs?.classes?.filter((cls) => findClassReference(owner, [cls]))
  if (owners.length !== 1 || classes?.length !== 1 || !catalogs) return undefined
  const cls = classes[0]
  const source = norm(cls.source)
  if (
    (source !== 'phb' && source !== 'xphb') ||
    cls.sourceIdentityConflict ||
    cls._copy ||
    !getSourceCompatibility(cls.source, character.originSystem).compatible
  )
    return undefined
  const base = (name: string) => {
    const refs = cls.classFeatureRefs?.filter((ref) => ref.name === name)
    const ref = refs?.[0]
    if (refs?.length !== 1 || !ref?.level || ref.level > owner.levels) return undefined
    const target = getClassFeatureIdentity(ref)
    const digest = getFeatureSourceDigest(ref.feature?.entries ?? [])
    if (!target || !digest) return undefined
    const feature = getCurrentDirectClassFeature(
      cls,
      catalogs,
      target,
      (row) => getFeatureSourceDigest(row.entries ?? []) === digest,
    )
    return feature?.entries?.length
      ? { target, name, source: feature.source, level: ref.level, entries: feature.entries }
      : undefined
  }
  const choices = cls.subclasses?.filter(
    (subclass) =>
      findClassReference({ name: owner.subclass, source: owner.subclassSource }, [subclass]) &&
      findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }]),
  )
  const subclass = choices?.[0]
  const gain = getCurrentNativeSubclassGain(cls)?.level
  const inherited = subclass && isInheritedClassicSubclass(subclass)
  if (
    choices?.length !== 1 ||
    !subclass ||
    subclass.sourceIdentityConflict ||
    ('_copy' in subclass && !inherited) ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (allowed) => norm(allowed) === norm(subclass.source),
      )) ||
    !gain ||
    owner.levels < gain
  )
    return { owner, source, base, specialization: undefined }

  const origin = inherited ? 'PHB' : cls.source
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source),
  )
  const earned = (name: string) => {
    const refs = subclass.subclassFeatureRefs?.filter((ref) => ref.name === name) ?? []
    if (refs.length > 1) return undefined
    const level = refs[0]?.level ?? gain
    if (level > owner.levels || !getCurrentNativeSubclassGain(cls, level)) return undefined
    const target = getSubclassFeatureIdentity({
      name,
      className: cls.name,
      classSource: origin,
      subclassShortName: subclass.shortName,
      subclassSource: subclass.source,
      source: subclass.source,
      level,
    })
    if (!target) return undefined
    const feature = refs.length
      ? getDirectSubclassFeatureReference(subclass, target)?.feature
      : getNativeSubclassIntroFeature(cls, subclass, level, name, origin)?.feature
    const digest = feature && getFeatureSourceDigest(feature.entries ?? [])
    const valid = (row: SubclassFeature) =>
      !('_copy' in row) &&
      !row.isClassFeatureVariant &&
      !row.sourceIdentityConflict &&
      !row.featureOptionSourceConflict &&
      getSubclassFeatureIdentity(row) === target &&
      !!digest &&
      getFeatureSourceDigest(row.entries ?? []) === digest
    const candidates =
      scoped.subclassFeatureCandidates?.get(target) ??
      scoped.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
    return feature && valid(feature) && candidates.length && candidates.every(valid)
      ? { target, name, source: subclass.source, level, entries: feature.entries ?? [] }
      : undefined
  }
  return { owner, source, base, specialization: { subclass, origin, earned } }
}
