import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import { NATIVE_FIEND_SUBCLASSES } from '@/lib/5etools/fiendSubclassFeatureSource'
import {
  findNativeSubclass,
  getDirectSubclassFeatureReference,
} from '@/lib/5etools/nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

type NativeSource = keyof typeof NATIVE_FIEND_SUBCLASSES

const classFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'header',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
])
const subclassFields = new Set([...classFields, 'subclassShortName', 'subclassSource'])

const bodies = {
  phb: {
    slots: 'd06984eb9b6ee8302795f1a877907924ae5110bafffa72f9373eaab0ce2ac2c9',
    master: 'e3ad0e24f13b0f61477ee996f610664862911f55b48f5db4cc01b52a6fdc9f6a',
    blessing: 'd5cbc74201c40ba0ff5b7a42ed827636c95a492fe107d2f6e47b7bc6c94af6b2',
    direct: [
      'd749dbcbedb6db0fb16f1847d102640b4ae8e4a71120a36e1739d72f8aa85e9d',
      'd4168859e0403c840648a12339562d4995a80dea91ad8650dd6daa130d71a79d',
      'e1073cd89a7faebf5974baba65e386d2c1a7592535844324e2f173d40cf7b7af',
    ],
  },
  xphb: {
    slots: '8de3c894d62282c3c105337397d772d848ad342ade5b121599ab1321593c00cc',
    master: 'bd031c844820e27534ce76879534055783eb5dd6cdeefcbf8b8dfce4a9eea6b3',
    blessing: '37301e69ce3cd1a6b0bbded4802542a7dc67db168ac98822d73d9c966a388cf0',
    direct: [
      '2df6ea140b5055d7815d832babae93e762a0e44517a549f2f394c4d88d8e4b13',
      '69d64957a15fbeb4fa38cb4a312cf8917ff82410203deb164ff714d14494c147',
      'bbe95a484e7ea1a40d6b22aa979eb36c1bc1edffc3cf3bc3723da8963faa8517',
    ],
  },
} as const
const magicalCunning = '83b8faed320d8d149abdbfc634697272164384d7bb9f3be075a88c1aac890146'
const classTarget = (name: string, source: NativeSource, level: number) =>
  `class-feature|${name}|warlock|${source}|${level}|${source}`

function getPactRecovery(feature: ClassFeature, source: NativeSource) {
  if (!hasFeatureSourceShape(feature, classFields) || !Array.isArray(feature.entries))
    return undefined
  const groups =
    source === 'phb'
      ? feature.entries
      : feature.entries.flatMap((entry) => {
          const group = record(entry)
          return group.type === 'entries' && Array.isArray(group.entries) ? group.entries : []
        })
  const slots = groups
    .map(record)
    .filter(({ type, name }) => type === 'entries' && name === 'Spell Slots')
  const body = slots[0]?.entries
  return slots.length === 1 &&
    Array.isArray(body) &&
    getFeatureSourceDigest(body, false) === bodies[source].slots
    ? body.slice(0, 1)
    : undefined
}

function getFiendStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  source: NativeSource,
): SubclassFeature[] {
  const owner = NATIVE_FIEND_SUBCLASSES[source]
  if (
    !findClassReference({ name: entry.subclass, source: entry.subclassSource }, [owner]) ||
    entry.levels < owner.level ||
    !matchesNativeSubclassGain(
      cls,
      classTarget(
        source === 'phb' ? 'otherworldly patron' : 'warlock subclass',
        source,
        owner.level,
      ),
      owner.level,
    )
  )
    return []
  const subclass = findNativeSubclass(cls, owner)
  if (!subclass) return []

  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const byTarget = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)
    : catalogs.subclassFeatureCandidates
  const candidates = (target: string) =>
    catalogs.subclassTargets || byTarget
      ? (byTarget?.get(target) ?? [])
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
  const exactBody = (feature: SubclassFeature | undefined, target: string, digest: string) =>
    !!feature &&
    getSubclassFeatureIdentity(feature) === target &&
    hasFeatureSourceShape(feature, subclassFields) &&
    Array.isArray(feature.entries) &&
    getFeatureSourceDigest(feature.entries, false) === digest
  const verified = (attached: SubclassFeature | undefined, target: string, digest: string) => {
    const mirrors = candidates(target)
    return attached &&
      exactBody(attached, target, digest) &&
      mirrors.length &&
      mirrors.every((row) => exactBody(row, target, digest))
      ? attached
      : undefined
  }

  // The intro prose may vary. Its one unconditional Blessing reference and exact leaf are required.
  const targetOf = (uid: unknown) =>
    typeof uid === 'string' ? decodeOptionalDeclaration(uid, 'subclassFeature')?.target : undefined
  const blessingFrom = (intro: SubclassFeature | undefined) => {
    if (
      !intro ||
      !hasFeatureSourceShape(intro, subclassFields) ||
      getSubclassFeatureIdentity(intro) !== owner.intro ||
      !Array.isArray(intro.entries)
    )
      return undefined
    const refs = intro.entries
      .map(record)
      .filter((row) => targetOf(row.subclassFeature) === owner.blessing)
    const ref = refs[0]
    const uid = ref?.subclassFeature
    return refs.length === 1 &&
      ref.type === 'refSubclassFeature' &&
      typeof uid === 'string' &&
      exactOptionalDeclarationReference(ref, uid, 'subclassFeature') &&
      Object.keys(ref).every(
        (key) => key === 'type' || key === 'subclassFeature' || key === 'feature',
      )
      ? (ref.feature as SubclassFeature | undefined)
      : undefined
  }
  const intro =
    targetOf(subclass.introFeatureRef) === owner.intro
      ? getDirectSubclassFeatureReference(subclass, owner.intro)?.feature
      : undefined
  const mirrors = candidates(owner.intro)
  const blessing =
    mirrors.length &&
    mirrors.every((row) => exactBody(blessingFrom(row), owner.blessing, bodies[source].blessing))
      ? verified(blessingFrom(intro), owner.blessing, bodies[source].blessing)
      : undefined

  const direct = owner.direct.flatMap(({ target, level }, index) => {
    const gain = classTarget(
      source === 'phb' ? 'otherworldly patron feature' : 'subclass feature',
      source,
      level,
    )
    if (entry.levels < level || !matchesNativeSubclassGain(cls, gain, level, 'at-level')) return []
    const feature = verified(
      getDirectSubclassFeatureReference(subclass, target)?.feature,
      target,
      bodies[source].direct[index],
    )
    return feature ? [feature] : []
  })
  return blessing ? [blessing, ...direct] : direct
}

export function getWarlockStaticFeatures(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const source = cls.source.trim().toLowerCase()
  if (
    (source !== 'phb' && source !== 'xphb') ||
    !Number.isInteger(entry.levels) ||
    entry.levels < 1 ||
    entry.levels > 20 ||
    cls.sourceIdentityConflict ||
    '_copy' in cls
  )
    return []

  const pact = getCurrentDirectClassFeature(
    cls,
    catalogs,
    classTarget('pact magic', source, 1),
    (feature) => !!getPactRecovery(feature, source),
  )
  const fixedClassFeatures = [
    ...(source === 'xphb' ? [['magical cunning', 2, magicalCunning] as const] : []),
    ['eldritch master', 20, bodies[source].master] as const,
  ].flatMap(([name, gain, digest]) => {
    if (entry.levels < gain) return []
    const feature = getCurrentDirectClassFeature(
      cls,
      catalogs,
      classTarget(name, source, gain),
      (row) =>
        hasFeatureSourceShape(row, classFields) &&
        Array.isArray(row.entries) &&
        getFeatureSourceDigest(row.entries, false) === digest,
    )
    return feature ? [feature] : []
  })
  return [
    ...(pact ? [{ ...pact, entries: getPactRecovery(pact, source) }] : []),
    ...fixedClassFeatures,
    ...getFiendStaticFeatures(cls, entry, catalogs, source),
  ]
}
