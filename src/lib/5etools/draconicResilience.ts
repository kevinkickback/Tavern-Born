import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { getSubclassSelectionInfo } from './classData'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { getEntityLookupKey } from './entityIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature, matchesRetainedFirstSubclassGain } from './ownedSubclassFeature'

const name = 'Draconic Resilience'
const className = 'Sorcerer'
const featureFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'header',
  'entries',
  'page',
  'srd',
  'srd52',
  'basicRules2024',
  'subclassProficiencySourceAudit',
])

function nativeRule(source: string, subclass: string, level: number, body: string) {
  const printing = source.toLowerCase()
  const uidSuffix = `|sorcerer|${printing}|draconic|${printing}|${level}|${printing}`
  return {
    source,
    level,
    intro: `subclass-feature|${subclass.toLowerCase()}${uidSuffix}`,
    leaf: `subclass-feature|draconic resilience${uidSuffix}`,
    ownerKey: getFeatureOwnerKey(className, source, subclass, source),
    classKey: getEntityLookupKey(className, source).toLowerCase(),
    body,
  }
}

// The two leaf bodies agree between the bundled SRD and configured catalog.
const classic = nativeRule(
  'PHB',
  'Draconic Bloodline',
  1,
  '7cd6f127755752e236831db6d99e0795c41d32b8be6e26c500f1c29058e4bbd3',
)
const revised = nativeRule(
  'XPHB',
  'Draconic Sorcery',
  3,
  'e81badacf979bdec3b194f45fb9d8cd0a829fff845b4430636609602aff8d1cf',
)
const rules = [classic, revised]
type NativeRule = typeof classic

function matchesOwner(subclass: Subclass5e, rule: NativeRule): boolean {
  return (
    getFeatureOwnerKey(subclass.className, subclass.classSource, subclass.name, subclass.source) ===
    rule.ownerKey
  )
}

export function isNativeResilienceIntro(
  cls: Class5e,
  subclass: Subclass5e,
  target: string | undefined,
): boolean {
  return rules.some(
    (rule) =>
      target === rule.intro &&
      getEntityLookupKey(cls.name, cls.source).toLowerCase() === rule.classKey &&
      matchesOwner(subclass, rule),
  )
}

export function isNativeResilienceTarget(target: string | undefined): boolean {
  return rules.some((rule) => target === rule.intro || target === rule.leaf)
}

function uidTarget(uid: unknown) {
  return typeof uid === 'string'
    ? decodeOptionalDeclaration(uid, 'subclassFeature')?.target
    : undefined
}

function hasNativeShape(feature: SubclassFeature | undefined, target: string) {
  return (
    !!feature &&
    hasFeatureSourceShape(feature, featureFields) &&
    getSubclassFeatureIdentity(feature) === target
  )
}

function verifiesLeaf(feature: SubclassFeature | undefined, rule: NativeRule): boolean {
  return (
    hasNativeShape(feature, rule.leaf) &&
    Array.isArray(feature?.entries) &&
    getFeatureSourceDigest(feature.entries, false) === rule.body
  )
}

function verifiesIntro(feature: SubclassFeature | undefined, rule: NativeRule): boolean {
  if (!hasNativeShape(feature, rule.intro) || !Array.isArray(feature?.entries)) return false
  const refs = feature.entries
    .map(record)
    .filter((row) => uidTarget(row.subclassFeature) === rule.leaf)
  const ref = refs[0]
  return (
    refs.length === 1 &&
    ref.type === 'refSubclassFeature' &&
    !ref.sourceIdentityConflict &&
    Object.keys(ref).every((field) => ['type', 'subclassFeature', 'feature'].includes(field)) &&
    verifiesLeaf(ref.feature as SubclassFeature | undefined, rule)
  )
}

function getEarnedNativeDraconicResilience(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (!catalogs) return undefined
  const rule = character.originSystem === '2024' ? revised : classic
  const entries = character.classProgression.filter(
    (entry) => getEntityLookupKey(entry.name, entry.source).toLowerCase() === rule.classKey,
  )
  const entry = entries[0]
  if (
    entries.length !== 1 ||
    entry.levels < rule.level ||
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource) !==
      rule.ownerKey
  )
    return undefined

  const classes = catalogs.classes?.filter(
    (cls) => getEntityLookupKey(cls.name, cls.source).toLowerCase() === rule.classKey,
  )
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict || '_copy' in classes[0])
    return undefined
  if (getSubclassSelectionInfo(classes[0]).subclassLevel !== rule.level) return undefined
  const subclasses = classes[0].subclasses?.filter((row) => matchesOwner(row, rule))
  if (subclasses?.length !== 1 || subclasses[0].sourceIdentityConflict || '_copy' in subclasses[0])
    return undefined
  const subclass = subclasses[0]
  const declarations = (
    Array.isArray(subclass.subclassFeatures) ? subclass.subclassFeatures : []
  ).filter(
    (row) => uidTarget(typeof row === 'string' ? row : record(row).subclassFeature) === rule.intro,
  )
  const refs = subclass.subclassFeatureRefs?.filter(
    (ref) => uidTarget(ref.ref) === rule.intro || getSubclassFeatureIdentity(ref) === rule.intro,
  )
  const ref = refs?.[0]
  if (
    typeof subclass.shortName !== 'string' ||
    subclass.shortName.trim().toLowerCase() !== 'draconic' ||
    uidTarget(subclass.introFeatureRef) !== rule.intro ||
    declarations.length !== 1 ||
    typeof declarations[0] !== 'string' ||
    refs?.length !== 1 ||
    !ref ||
    ref.sourceIdentityConflict ||
    uidTarget(ref.ref) !== rule.intro ||
    !exactOptionalDeclarationReference(record(ref), ref.ref, 'subclassFeature') ||
    !verifiesIntro(ref.feature, rule)
  )
    return undefined

  const candidates = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(rule.ownerKey)
    : catalogs.subclassFeatureCandidates
  const candidatesFor = (target: string) =>
    catalogs.subclassTargets || candidates
      ? candidates?.get(target)
      : catalogs.subclassFeatures.filter(
          (feature) => getSubclassFeatureIdentity(feature) === target,
        )
  const intros = candidatesFor(rule.intro)
  const leaves = candidatesFor(rule.leaf)
  if (
    !intros?.length ||
    !intros.every((feature) => verifiesIntro(feature, rule)) ||
    !leaves?.length ||
    !leaves.every((feature) => verifiesLeaf(feature, rule))
  )
    return undefined
  return {
    id: rule.leaf,
    name,
    source: rule.source,
    target: rule.leaf,
    levels: entry.levels,
    revised: rule === revised,
  }
}

export function getEarnedDraconicResilience(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const native = getEarnedNativeDraconicResilience(character, catalogs)
  const results = native ? [native] : []
  if (
    character.originSystem !== '2024' ||
    !catalogs?.subclassTargets ||
    !permitsClassRuleSource(character, revised.source)
  )
    return results
  for (const entry of character.classProgression) {
    if (!entry.subclass || !permitsClassRuleSource(character, entry.subclassSource)) continue
    const cls = getCurrentSelectedClass(character, entry, catalogs)
    if (
      !cls ||
      getEntityLookupKey(cls.name, cls.source).toLowerCase() === revised.classKey ||
      !matchesRetainedFirstSubclassGain(
        cls,
        'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb',
        revised.level,
      )
    )
      continue
    const subclasses = cls.subclasses?.filter((row) =>
      findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
    )
    if (subclasses?.length !== 1) continue
    const [subclass] = subclasses
    const key = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
    const retained = getOwnedSubclassFeature(
      cls,
      subclass,
      revised.leaf,
      scopeClassChoiceFeatureCatalogs(catalogs, key),
    )
    if (retained && retained.level <= entry.levels && verifiesLeaf(retained.feature, revised))
      results.push({
        id: `${key}:${revised.leaf}`,
        name,
        source: revised.source,
        target: revised.leaf,
        levels: entry.levels,
        revised: true,
      })
  }
  return results
}
