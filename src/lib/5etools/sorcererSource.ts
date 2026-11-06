import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { parseTableResources } from '@/lib/5etools/classRuleNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  findNativeDraconicSubclass,
  getDirectDraconicFeatureReference,
  NATIVE_DRACONIC_SUBCLASSES,
} from '@/lib/5etools/draconicSubclassFeatureSource'
import {
  type ClassFeatureSourceCatalog,
  getFeatureSourceDigest,
  hasFeatureSourceShape,
} from '@/lib/5etools/featureSourceAudit'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef, ClassResourceRecovery } from '@/types/classRules'

export const SORCERY_POINTS_ID = 'sorcerer-sorcery-points'
export const INNATE_SORCERY_ID = 'sorcerer-innate-sorcery'

type NativeSorcererSource = 'phb' | 'xphb'
const nativeSorcerers = [
  { name: 'Sorcerer', source: 'phb' },
  { name: 'Sorcerer', source: 'xphb' },
] as const
export const NATIVE_METAMAGIC_CHOICES = {
  phb: 'class:sorcerer|phb|choice:metamagic|3',
  xphb: 'class:sorcerer|xphb|choice:metamagic|2',
} as const

export function isNativeSorcerer(entry: CharacterClassEntry) {
  return !!findClassReference(entry, nativeSorcerers)
}

export function getCurrentNativeSorcerer(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (!catalogs) return undefined
  const source: NativeSorcererSource = character.originSystem === '2014' ? 'phb' : 'xphb'
  const reference = { name: 'Sorcerer', source }
  const owners = character.classProgression.filter((row) => findClassReference(reference, [row]))
  const classes = catalogs.classes?.filter((row) => findClassReference(reference, [row]))
  const owner = owners[0]
  if (
    owners.length !== 1 ||
    !Number.isInteger(owner.levels) ||
    owner.levels < 1 ||
    owner.levels > 20 ||
    classes?.length !== 1 ||
    classes[0].sourceIdentityConflict ||
    classes[0]._copy
  )
    return undefined
  return { owner, cls: classes[0], source, catalogs }
}

type CurrentSorcerer = NonNullable<ReturnType<typeof getCurrentNativeSorcerer>>
const target = (name: string, source: NativeSorcererSource, level: number) =>
  `class-feature|${name}|sorcerer|${source}|${level}|${source}`

const rulesFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'page',
  'header',
  'consumes',
  'srd',
  'basicRules',
  'srd52',
  'basicRules2024',
])
const bodyMatches = (feature: ClassFeature, digest: string) =>
  hasFeatureSourceShape(feature, rulesFields) &&
  Array.isArray(feature.entries) &&
  getFeatureSourceDigest(feature.entries, false) === digest

function earnedRule(current: CurrentSorcerer, name: string, level: number, digest: string) {
  if (current.owner.levels < level) return undefined
  return getCurrentDirectClassFeature(
    current.cls,
    current.catalogs,
    target(name, current.source, level),
    (feature) => bodyMatches(feature, digest),
  )
}

export function getInnateSorcery(current: CurrentSorcerer | undefined) {
  return current?.source === 'xphb'
    ? earnedRule(
        current,
        'innate sorcery',
        1,
        'f9c6c56dcd823b39d25ac80ce8fd6a87b5fb8d4d74e5ad1ea17fd7ef2b5f12ca',
      )
    : undefined
}

export function getInnateSorceryUpgrades(current: CurrentSorcerer) {
  return [
    earnedRule(
      current,
      'sorcery incarnate',
      7,
      '6d0dc1358a7c39b8569e90c987485d2ffc28d24271b0450cca0acde5769fe5d4',
    ),
    earnedRule(
      current,
      'arcane apotheosis',
      20,
      'c1145af65d66ec22da2973b53250962b267e668c3c62dda9b2e6f105eba24992',
    ),
  ]
}

const draconicFields = new Set([...rulesFields, 'subclassShortName', 'subclassSource'])

function getDraconicSubclassFeature(
  current: CurrentSorcerer,
  featureTarget: string,
  level: number,
  digest: string,
) {
  const { owner, cls, source, catalogs } = current
  const classic = source === 'phb'
  const draconic = NATIVE_DRACONIC_SUBCLASSES[source]
  const firstLevel = classic ? 1 : 3
  if (
    owner.levels < level ||
    !findClassReference({ name: owner.subclass, source: owner.subclassSource }, [draconic]) ||
    !matchesNativeSubclassGain(
      cls,
      target(classic ? 'sorcerous origin' : 'sorcerer subclass', source, firstLevel),
      firstLevel,
    ) ||
    !matchesNativeSubclassGain(
      cls,
      target(classic ? 'sorcerous origin feature' : 'subclass feature', source, level),
      level,
      'at-level',
    )
  )
    return undefined
  const subclass = findNativeDraconicSubclass(cls, draconic)
  if (!subclass) return undefined
  const matchesFeature = (feature: SubclassFeature | undefined): feature is SubclassFeature =>
    !!feature &&
    getSubclassFeatureIdentity(feature) === featureTarget &&
    hasFeatureSourceShape(feature, draconicFields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) === digest
  const feature = getDirectDraconicFeatureReference(subclass, featureTarget)?.feature
  if (!matchesFeature(feature)) return undefined
  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const candidates = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)?.get(featureTarget)
    : catalogs.subclassFeatureCandidates
      ? catalogs.subclassFeatureCandidates.get(featureTarget)
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === featureTarget)
  if (candidates?.length && candidates.every(matchesFeature))
    return { feature, ownerKey, target: featureTarget }
}

export function getDragonCompanion(current: CurrentSorcerer) {
  if (current.source !== 'xphb') return undefined
  return getDraconicSubclassFeature(
    current,
    NATIVE_DRACONIC_SUBCLASSES.xphb.companion,
    18,
    '441b128a48c0f3554896610b3d56e645c21a4cd27631df6c8553f72ed0d27ab6',
  )?.feature
}

export function getDragonWings(current: CurrentSorcerer) {
  return getDraconicSubclassFeature(
    current,
    NATIVE_DRACONIC_SUBCLASSES[current.source].wings,
    14,
    current.source === 'phb'
      ? 'e13c108386bfad182773c62de52e6f8fd9ba4657725506707b18ab664fe09ca7'
      : 'd7eae88aa4ac025f18ed8dc1c6b3e1e331f2c9929626d1daa733086ba0e053df',
  )
}

export function getCurrentMetamagicChoiceId(current: CurrentSorcerer) {
  const level = current.source === 'phb' ? 3 : 2
  return current.owner.levels >= level &&
    getCurrentDirectClassFeature(
      current.cls,
      current.catalogs,
      target('metamagic', current.source, level),
    )
    ? NATIVE_METAMAGIC_CHOICES[current.source]
    : undefined
}

function hasClassicPointsLeaf(catalogs: ClassFeatureSourceCatalog) {
  const leaf = target('sorcery points', 'phb', 2)
  const rows = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(leaf)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === leaf)
  return (
    rows?.length === 1 &&
    getClassFeatureIdentity(rows[0]) === leaf &&
    bodyMatches(rows[0], 'e59bb78241a2b6f1adabd7180b71bb103823938da7e06fdca95f57f2c54c6f9d')
  )
}

function getSorceryPointsTable(cls: Class5e) {
  const labels = (cls.classTableGroups ?? []).flatMap((group) =>
    group && typeof group === 'object' && 'colLabels' in group && Array.isArray(group.colLabels)
      ? group.colLabels
      : [],
  )
  if (
    labels.filter(
      (label) => typeof label === 'string' && label.trim().toLowerCase() === 'sorcery points',
    ).length !== 1
  )
    return undefined
  return parseTableResources(cls, [])[0]
}

export function getSorcererResourceDefs(current: CurrentSorcerer): ClassResourceDef[] {
  const resources: ClassResourceDef[] = []
  const classic = current.source === 'phb'
  const font = earnedRule(
    current,
    'font of magic',
    2,
    classic
      ? 'e549463ff1879a51823d39510f86e43e574e10daa7bf77294362ffd3276b019a'
      : 'a5474287a712e4d092c18a48ea19e1c7fb94b4fa5c1c1a415fa30e6d64c5c796',
  )
  // The classic Font body declares a nested Sorcery Points reference with its own rules.
  const points =
    font && (!classic || hasClassicPointsLeaf(current.catalogs))
      ? getSorceryPointsTable(current.cls)
      : undefined
  if (
    points?.id === SORCERY_POINTS_ID &&
    points.maxPerLevel.length === 20 &&
    points.maxPerLevel[0] === 0 &&
    points.maxPerLevel.slice(1).every((max) => Number.isInteger(max) && max > 0)
  ) {
    const restoration = earnedRule(
      current,
      'sorcerous restoration',
      classic ? 20 : 5,
      classic
        ? 'b2da263f7bfe837059cb81bd329ce9aa6753fb78e3152d619d3e0f9fcbc266f7'
        : '31a0086f8f9174edde65ac624fd0264ffb279b7e8de25925fd48cec5ad15c703',
    )
    const recovery: ClassResourceRecovery = { longRest: 'all', unit: 'points' }
    if (restoration) {
      recovery.shortRest = classic ? 4 : Math.floor(current.owner.levels / 2)
      if (!classic) recovery.shortRestOncePerLongRest = true
    }
    resources.push({ ...points, recovery, restType: restoration ? 'short' : 'long' })
  }
  if (getInnateSorcery(current)) {
    resources.push({
      id: INNATE_SORCERY_ID,
      label: 'Innate Sorcery',
      maxPerLevel: Array(20).fill(2),
      restType: 'long',
      recovery: { longRest: 'all' },
    })
  }
  return resources
}
