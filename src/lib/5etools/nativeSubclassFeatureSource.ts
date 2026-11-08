import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export const FIGHTER_SUBCLASS_RESOURCE_FEATURES = new Map([
  ['EGW', ['Unleash Incarnation', 'Reclaim Potential']],
  ['TCE', ["Giant's Might", 'Runic Shield', 'Psionic Power']],
  ['XGE', ['Arcane Shot', 'Unwavering Mark', 'Warding Maneuver', 'Fighting Spirit']],
  ['AU', ['Arcane Shot']],
  ['FRHoF', ['Group Recovery']],
  ['XPHB', ['Psionic Power']],
])

const directFighterRules = new Set([
  ...[...FIGHTER_SUBCLASS_RESOURCE_FEATURES.values()].flat().map((name) => name.toLowerCase()),
  'arcane archer lore',
  'knightly envoy',
  'telekinetic master',
  'rune carver',
  'combat superiority',
  'remarkable athlete',
  'guarded mind',
  'inspiring commander',
])

export function isDirectFighterRuleTarget(target: string | undefined) {
  const [, name, className, , subclass] = target?.split('|') ?? []
  return className === 'fighter' && (name === subclass || directFighterRules.has(name))
}

const directMonkSpellRules = new Set([
  'way of the four elements',
  'disciple of the elements',
  'elemental disciplines',
  'way of shadow',
  'warrior of shadow',
  'shadow arts',
  'darkness',
  'shadowy figments',
  'searing arc strike',
  'tranquility',
  'warrior of the elements',
  'manipulate elements',
  'darkvision',
  'ascendant aspect',
  'aspect of the wyrm',
  'breath of the dragon',
  'wings unfurled',
  'wholeness of body',
  'flurry of healing and harm',
  'hand of ultimate mercy',
])

export function isDirectMonkSpellTarget(target: string | undefined) {
  const [, name, className] = target?.split('|') ?? []
  return className === 'monk' && directMonkSpellRules.has(name)
}

const directRangerRules = new Set([
  'dread ambusher',
  'umbral sight',
  'iron mind',
  'otherworldly glamour',
  'fey reinforcements',
  'frigid explorer',
  'hungering might',
  'draconic gift',
  'drake companion',
  'bond of fang and scale',
  "drake's breath",
  'perfected bond',
  'detect portal',
  'ethereal step',
  "hunter's sense",
  "magic-user's nemesis",
  'misty wanderer',
  'writhing tide',
  'swarming dispersal',
  'fortifying soul',
  'chilling retribution',
  'frozen haunt',
  'ancient might',
])

export function isDirectRangerRuleTarget(target: string | undefined) {
  const [, name, className, classSource, subclass, subclassSource] = target?.split('|') ?? []
  return (
    className === 'ranger' &&
    (name === subclass ||
      (classSource === 'phb' && subclass === 'hunter' && subclassSource === 'phb') ||
      name === `${subclass} spells` ||
      name === `${subclass} magic` ||
      directRangerRules.has(name))
  )
}

const sameSubclass = (row: Record<string, unknown>, base: Record<string, unknown>) =>
  typeof row.name === 'string' &&
  row.name === base.name &&
  row.shortName === base.shortName &&
  row.source === base.source &&
  row.className === base.className

export function isInheritedClassicSubclass(row: Record<string, unknown>) {
  const copy = record(row._copy)
  return (
    row.classSource === 'XPHB' &&
    copy.classSource === 'PHB' &&
    sameSubclass(row, copy) &&
    !('_mod' in copy)
  )
}

export function isInheritedFighterSubclass(row: Record<string, unknown>) {
  return row.className === 'Fighter' && isInheritedClassicSubclass(row)
}

export function auditInheritedSubclassRoots(
  raw: readonly Record<string, unknown>[],
  materialized: readonly Record<string, unknown>[],
) {
  return materialized.map((row, index) => {
    const authored = raw[index]
    if (
      (row.className !== 'Fighter' && row.className !== 'Monk' && row.className !== 'Ranger') ||
      row.classSource !== 'XPHB' ||
      !('_copy' in authored)
    )
      return row
    const origins = raw.filter((base) => base.classSource === 'PHB' && sameSubclass(row, base))
    return isInheritedClassicSubclass(row) &&
      ![
        'subclassFeatures',
        'additionalSpells',
        'spellcastingAbility',
        'optionalfeatureProgression',
      ].some((field) => field in authored) &&
      origins.length === 1 &&
      !('_copy' in origins[0]) &&
      !origins[0].sourceIdentityConflict
      ? row
      : { ...row, sourceIdentityConflict: true }
  })
}

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

/** Resolve a single unambiguous feature declared inside the subclass's earned introduction. */
export function getNativeSubclassIntroFeature(
  cls: Pick<Class5e, 'name' | 'source'>,
  subclass: Subclass5e,
  level: number,
  featureName: string,
  origin = cls.source,
) {
  const identity = (name: string) =>
    getSubclassFeatureIdentity({
      name,
      className: cls.name,
      classSource: origin,
      subclassShortName: subclass.shortName,
      subclassSource: subclass.source,
      source: subclass.source,
      level,
    })
  const parent = identity(subclass.name)
  const target = identity(featureName)
  if (!parent || !target) return undefined
  const intro = getDirectSubclassFeatureReference(subclass, parent)
  const exact = (feature: SubclassFeature | undefined, key: string) =>
    feature &&
    !('_copy' in feature) &&
    !feature.isClassFeatureVariant &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    getSubclassFeatureIdentity(feature) === key
  if (intro?.ref !== subclass.introFeatureRef || !exact(intro?.feature, parent)) return undefined

  const entries = intro?.feature?.entries
  if (!Array.isArray(entries)) return undefined
  const matches = entries
    .map(record)
    .filter(
      (row) =>
        row.type === 'refSubclassFeature' &&
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target === target,
    )
  const [child] = matches
  const feature = child?.feature as SubclassFeature | undefined
  return matches.length === 1 &&
    !child.sourceIdentityConflict &&
    typeof child.subclassFeature === 'string' &&
    exactOptionalDeclarationReference(child, child.subclassFeature, 'subclassFeature') &&
    exact(feature, target)
    ? { target, entries: feature?.entries, feature }
    : undefined
}
