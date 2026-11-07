import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

const inheritedCircles = [
  {
    shortName: 'spores',
    schedule: '94a77eb361b4b293a1ec8356733e2fee2e09944d09845ceb835e76fc786fa707',
    spells: 'cc775cf87d15965a0a2945a599464339fcb976f50670de8a7ff0e5488b6f45b3',
  },
  {
    shortName: 'wildfire',
    schedule: '19d32fa53707e0812305d5cbd5be6a8ba343991b68b5bc5ba62ea6415f0c670e',
    spells: '9acd25d7bd8260cbcc9fc1028e5470a1904aac80b7036d89df11ee309b6e312b',
  },
]
const spellsTarget = (shortName: string) =>
  `subclass-feature|circle spells|druid|phb|${shortName}|tce|2|tce`

export function isRevisedInheritedCircleOwner(entry: CharacterClassEntry) {
  return (
    norm(entry.name) === 'druid' &&
    norm(entry.source) === 'xphb' &&
    norm(entry.subclassSource) === 'tce' &&
    inheritedCircles.some(({ shortName }) => norm(entry.subclass) === `circle of ${shortName}`)
  )
}

/** The audited TCE copies keep their classic schedule but use its revised spell printings. */
export function hasRevisedInheritedCircleSpells(cls: Class5e, subclass: Subclass5e) {
  if (
    norm(cls.name) !== 'druid' ||
    norm(cls.source) !== 'xphb' ||
    norm(subclass.className) !== 'druid' ||
    norm(subclass.classSource) !== 'xphb' ||
    norm(subclass.source) !== 'tce' ||
    subclass.sourceIdentityConflict
  )
    return false
  const rule = inheritedCircles.find(({ shortName }) => norm(subclass.shortName) === shortName)
  if (
    !rule ||
    norm(subclass.name) !== `circle of ${rule.shortName}` ||
    !matchesNativeSubclassGain(cls, 'class-feature|druid subclass|druid|xphb|3|xphb', 3)
  )
    return false
  const copy = record(record(subclass)._copy)
  if (
    copy.name !== subclass.name ||
    copy.className !== 'Druid' ||
    copy.classSource !== 'PHB' ||
    copy.source !== 'TCE' ||
    copy.shortName !== subclass.shortName ||
    copy._mod
  )
    return false
  const introTarget = `subclass-feature|circle of ${rule.shortName}|druid|xphb|${rule.shortName}|tce|3|tce`
  const intro = getDirectSubclassFeatureReference(subclass, introTarget)?.feature
  if (
    !intro ||
    intro.isClassFeatureVariant ||
    intro.sourceIdentityConflict ||
    getSubclassFeatureIdentity(intro) !== introTarget ||
    !Array.isArray(intro.entries)
  )
    return false
  const target = spellsTarget(rule.shortName)
  const refs = intro.entries
    .map(record)
    .filter(
      ({ subclassFeature }) =>
        typeof subclassFeature === 'string' &&
        decodeOptionalDeclaration(subclassFeature, 'subclassFeature')?.target === target,
    )
  const ref = refs[0]
  if (
    refs.length !== 1 ||
    ref.type !== 'refSubclassFeature' ||
    typeof ref.subclassFeature !== 'string' ||
    !exactOptionalDeclarationReference(ref, ref.subclassFeature, 'subclassFeature') ||
    Object.keys(ref).some((key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature')
  )
    return false
  const feature = ref.feature as SubclassFeature | undefined
  return (
    !!feature &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries) === rule.spells &&
    Array.isArray(subclass.additionalSpells) &&
    getFeatureSourceDigest(subclass.additionalSpells) === rule.schedule
  )
}
