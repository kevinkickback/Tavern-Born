import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { getDirectSubclassFeatureReference } from '@/lib/5etools/nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

/** A configured subclass may retain its classic feature UID on a revised owner. */
export function getDeclaredSubclassStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  gain: { level: number; intro: string; later: string; expandNestedRules?: true },
) {
  if (
    !entry.subclass ||
    !entry.subclassSource ||
    !Number.isInteger(entry.levels) ||
    entry.levels < gain.level ||
    entry.levels > 20 ||
    !findClassReference(entry, [cls])
  )
    return []
  const source = norm(cls.source)
  const className = norm(cls.name)
  const classTarget = (name: string, level: number) =>
    `class-feature|${name}|${className}|${source}|${level}|${source}`
  const matches = cls.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  const subclass = matches?.[0]
  if (
    matches?.length !== 1 ||
    !subclass ||
    typeof subclass.shortName !== 'string' ||
    subclass.sourceIdentityConflict ||
    !findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return []
  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const current = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)
    : catalogs.subclassFeatureCandidates
  const verified = (feature: SubclassFeature | undefined, target: string) => {
    if (!feature || !Array.isArray(feature.entries) || !feature.entries.length) return undefined
    const digest = getFeatureSourceDigest(feature.entries)
    const candidates =
      current?.get(target) ??
      (catalogs.subclassTargets || current
        ? []
        : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target))
    const valid = (row: SubclassFeature) =>
      !row.sourceIdentityConflict &&
      !row.featureOptionSourceConflict &&
      !row.isClassFeatureVariant &&
      getSubclassFeatureIdentity(row) === target &&
      !!digest &&
      Array.isArray(row.entries) &&
      getFeatureSourceDigest(row.entries) === digest
    return valid(feature) && candidates.length && candidates.every(valid) ? feature : undefined
  }
  const matchesOwner = (ref: string) => {
    const declaration = decodeOptionalDeclaration(ref, 'subclassFeature')
    const row = declaration?.decoded
    return row &&
      'subclassShortName' in row &&
      norm(row.className) === className &&
      (norm(row.classSource) === source ||
        (source === 'xphb' && norm(row.classSource) === 'phb')) &&
      norm(row.subclassShortName) === norm(subclass.shortName) &&
      norm(row.subclassSource) === norm(subclass.source)
      ? declaration
      : undefined
  }
  const withNestedRules = (feature: SubclassFeature) => {
    if (!gain.expandNestedRules || !feature.entries) return feature
    const siblings = feature.entries.map(record)
    return {
      ...feature,
      entries: feature.entries.map((entry, index) => {
        const row = siblings[index]
        const uid = row.subclassFeature
        if (row.type !== 'refSubclassFeature' || typeof uid !== 'string') return entry
        const child = matchesOwner(uid)
        if (
          !child ||
          child.decoded.level !== feature.level ||
          siblings.filter(
            (sibling) =>
              typeof sibling.subclassFeature === 'string' &&
              matchesOwner(sibling.subclassFeature)?.target === child.target,
          ).length !== 1 ||
          !exactOptionalDeclarationReference(row, uid, 'subclassFeature') ||
          Object.keys(row).some(
            (key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature',
          )
        )
          return entry
        const exact = verified(row.feature as SubclassFeature | undefined, child.target)
        return exact ? { type: 'entries', name: exact.name, entries: exact.entries } : entry
      }),
    }
  }
  const first = gain.level
  if (
    entry.levels < first ||
    !matchesNativeSubclassGain(cls, classTarget(gain.intro, first), first)
  )
    return []
  return (subclass.subclassFeatureRefs ?? []).flatMap((ref) => {
    const declaration = matchesOwner(ref.ref)
    if (!declaration || !declaration.decoded.level || declaration.decoded.level > entry.levels)
      return []
    const attached = getDirectSubclassFeatureReference(subclass, declaration.target)?.feature
    if (!attached || attached.sourceIdentityConflict || attached.isClassFeatureVariant) return []
    if (ref.ref === subclass.introFeatureRef && declaration.decoded.level === first) {
      const nested = (attached.entries ?? []).map(record).flatMap((row) => {
        const uid = row.subclassFeature
        if (typeof uid !== 'string') return []
        const nested = matchesOwner(uid)
        if (!nested?.decoded.level || nested.decoded.level > first) return []
        return [{ target: nested.target, uid, row }]
      })
      return nested.flatMap(({ target, uid, row }) => {
        if (
          nested.filter((entry) => entry.target === target).length !== 1 ||
          row.type !== 'refSubclassFeature' ||
          !exactOptionalDeclarationReference(row, uid, 'subclassFeature') ||
          Object.keys(row).some(
            (key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature',
          )
        )
          return []
        const exact = verified(row.feature as SubclassFeature | undefined, target)
        return exact ? [withNestedRules(exact)] : []
      })
    }
    if (
      !matchesNativeSubclassGain(
        cls,
        classTarget(gain.later, declaration.decoded.level),
        declaration.decoded.level,
        'at-level',
      )
    )
      return []
    const feature = verified(attached, declaration.target)
    return feature ? [withNestedRules(feature)] : []
  })
}
