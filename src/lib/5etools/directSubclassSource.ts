import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  getDirectSubclassFeatureReference,
  getNativeSubclassIntroFeature,
  isInheritedClassicSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'

export function getCurrentDirectSubclassSource(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
  className: 'Artificer' | 'Fighter' | 'Rogue',
) {
  const classKey = norm(className)
  if (
    norm(entry.name) !== classKey ||
    !entry.subclass ||
    !entry.subclassSource ||
    !getSourceCompatibility(entry.source, character.originSystem).compatible ||
    character.classProgression.filter((row) => norm(row.name) === classKey).length !== 1
  )
    return undefined
  const parents = classes?.filter(
    (cls) => norm(cls.name) === classKey && norm(cls.source) === norm(entry.source),
  )
  if (parents?.length !== 1) return undefined
  const [cls] = parents
  const roots = cls.subclasses?.filter(
    (row) =>
      norm(row.name) === norm(entry.subclass) &&
      norm(row.source) === norm(entry.subclassSource) &&
      norm(row.className) === classKey &&
      norm(row.classSource) === norm(cls.source),
  )
  const subclass = roots?.length === 1 ? roots[0] : undefined
  const inherited =
    !!subclass && subclass.className === className && isInheritedClassicSubclass(subclass)
  const gain = getCurrentNativeSubclassGain(cls)?.level
  if (
    !subclass ||
    subclass.sourceIdentityConflict ||
    ('_copy' in subclass && !inherited) ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (source) => norm(source) === norm(subclass.source),
      )) ||
    !gain ||
    gain > entry.levels
  )
    return undefined
  const origin = inherited ? 'PHB' : cls.source
  const introLevel = decodeSubclassFeatureReference(subclass.introFeatureRef ?? '').level
  return {
    subclass,
    getFeature(name: string) {
      const direct = subclass.subclassFeatureRefs?.filter((row) => row.name === name) ?? []
      if (direct.length > 1) return undefined
      const producerLevel = direct[0]?.level ?? introLevel
      if (producerLevel === undefined) return undefined
      const target = getSubclassFeatureIdentity({
        name,
        source: subclass.source,
        className: cls.name,
        classSource: origin,
        subclassShortName: subclass.shortName,
        subclassSource: subclass.source,
        level: producerLevel,
      })
      if (!target) return undefined
      const feature = direct.length
        ? getDirectSubclassFeatureReference(subclass, target)?.feature
        : getNativeSubclassIntroFeature(cls, subclass, producerLevel, name, origin)?.feature
      const level = Math.max(producerLevel, gain)
      if (
        !feature ||
        '_copy' in feature ||
        feature.sourceIdentityConflict ||
        feature.featureOptionSourceConflict ||
        feature.isClassFeatureVariant ||
        getSubclassFeatureIdentity(feature) !== target ||
        level > entry.levels ||
        !getCurrentNativeSubclassGain(cls, level) ||
        !Array.isArray(feature.entries)
      )
        return undefined
      return { target, level, entries: feature.entries }
    },
  }
}
