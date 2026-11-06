import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { parseTableResources } from '@/lib/5etools/classRuleNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  type ClassFeatureSourceCatalog,
  getFeatureSourceDigest,
  hasFeatureSourceShape,
} from '@/lib/5etools/featureSourceAudit'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
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

const draconic = { name: 'Draconic Sorcery', source: 'XPHB' }
const companionTarget = 'subclass-feature|dragon companion|sorcerer|xphb|draconic|xphb|18|xphb'
const companionFields = new Set([...rulesFields, 'subclassShortName', 'subclassSource'])

const isCompanionUid = (uid: unknown) =>
  typeof uid === 'string' &&
  decodeOptionalDeclaration(uid, 'subclassFeature')?.target === companionTarget

function verifiesDragonCompanion(feature: SubclassFeature | undefined) {
  return (
    !!feature &&
    getSubclassFeatureIdentity(feature) === companionTarget &&
    hasFeatureSourceShape(feature, companionFields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) ===
      '441b128a48c0f3554896610b3d56e645c21a4cd27631df6c8553f72ed0d27ab6'
  )
}

export function getDragonCompanion(current: CurrentSorcerer): SubclassFeature | undefined {
  const { owner, cls, source, catalogs } = current
  if (
    source !== 'xphb' ||
    owner.levels < 18 ||
    !findClassReference({ name: owner.subclass, source: owner.subclassSource }, [draconic]) ||
    !matchesNativeSubclassGain(cls, 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb', 3) ||
    !matchesNativeSubclassGain(
      cls,
      'class-feature|subclass feature|sorcerer|xphb|18|xphb',
      18,
      'at-level',
    )
  )
    return undefined
  const subclasses = cls.subclasses?.filter((row) => findClassReference(draconic, [row]))
  const subclass = subclasses?.[0]
  if (
    subclasses?.length !== 1 ||
    !subclass ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    typeof subclass.shortName !== 'string' ||
    subclass.shortName.trim().toLowerCase() !== 'draconic' ||
    !Array.isArray(subclass.subclassFeatures) ||
    !Array.isArray(subclass.subclassFeatureRefs) ||
    !findClassReference(cls, [{ name: subclass.className, source: subclass.classSource }])
  )
    return undefined
  const declarations = subclass.subclassFeatures.filter((row) =>
    isCompanionUid(typeof row === 'string' ? row : record(row).subclassFeature),
  )
  const refs = subclass.subclassFeatureRefs.filter(
    (row) => isCompanionUid(row.ref) || getSubclassFeatureIdentity(row) === companionTarget,
  )
  const ref = refs[0]
  if (
    declarations.length !== 1 ||
    typeof declarations[0] !== 'string' ||
    refs.length !== 1 ||
    !ref ||
    ref.sourceIdentityConflict ||
    record(ref).isClassFeatureVariant ||
    !isCompanionUid(ref.ref) ||
    !exactOptionalDeclarationReference(record(ref), ref.ref, 'subclassFeature') ||
    !verifiesDragonCompanion(ref.feature)
  )
    return undefined
  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const candidates = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)?.get(companionTarget)
    : catalogs.subclassFeatureCandidates
      ? catalogs.subclassFeatureCandidates.get(companionTarget)
      : catalogs.subclassFeatures.filter(
          (row) => getSubclassFeatureIdentity(row) === companionTarget,
        )
  return candidates?.length && candidates.every(verifiesDragonCompanion) ? ref.feature : undefined
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
