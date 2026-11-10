import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { hasFeatureSourceShape, matchesFeatureEntryDigest } from './featureSourceAudit'
import {
  findNativeSubclass,
  getDirectSubclassFeatureReference,
} from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import {
  getNativeWarlockPatronFeatureOwner,
  NATIVE_WARLOCK_PATRONS,
} from './warlockPatronFeatureSource'

export const ELDRITCH_HEX_TARGET =
  'subclass-feature|eldritch hex|warlock|xphb|great old one|xphb|10|xphb'
export const ELDRITCH_HEX_REFERENCE = 'Hex|XPHB'
export const ELDRITCH_HEX_RULE_DIGEST =
  'f7a602c8f69854dc475e8a5fe9ffb1f3a75f441c76990fd058bc094e16c2b780'
export const STEPS_OF_THE_FEY_TARGET =
  'subclass-feature|steps of the fey|warlock|xphb|archfey|xphb|3|xphb'
export const STEPS_OF_THE_FEY_RULE_DIGEST =
  '6907f2a31f211aa5e72589666590d2a9b418b4a4ad626d4cf67182755d5d49b3'
export const STEPS_OF_THE_FEY_SPELL = 'Misty Step|XPHB'
export const HEALING_LIGHT_TARGET =
  'subclass-feature|healing light|warlock|xphb|celestial|xphb|3|xphb'
export const HEALING_LIGHT_RULE_DIGEST =
  'd5a4c9796760112c562e3f83a828feab91911c9e04b9429f189a97fc5f5b67cb'
export const HEALING_LIGHT_RESOURCE_ID = 'warlock:xphb:celestial:healing-light'

const eldritchHexPatron = getNativeWarlockPatronFeatureOwner(ELDRITCH_HEX_TARGET)
const stepsPatron = getNativeWarlockPatronFeatureOwner(STEPS_OF_THE_FEY_TARGET)
const healingLightPatron = getNativeWarlockPatronFeatureOwner(HEALING_LIGHT_TARGET)

function getSelectedNativePatron(entry: CharacterClassEntry, patron: typeof eldritchHexPatron) {
  if (
    patron &&
    findClassReference(entry, [{ name: patron.className, source: patron.source }]) &&
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [patron])
  )
    return patron
}

export const getNativeEldritchHexOwner = (entry: CharacterClassEntry) =>
  getSelectedNativePatron(entry, eldritchHexPatron)

export const getNativeStepsOfTheFeyOwner = (entry: CharacterClassEntry) =>
  getSelectedNativePatron(entry, stepsPatron)

export const getNativeHealingLightOwner = (entry: CharacterClassEntry) =>
  getSelectedNativePatron(entry, healingLightPatron)

const subclassFields = new Set([
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
  'subclassShortName',
  'subclassSource',
])

export function getCurrentNativeWarlockPatronRules(
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
    !findClassReference(entry, [cls]) ||
    cls.sourceIdentityConflict ||
    '_copy' in cls
  )
    return undefined

  const owner = NATIVE_WARLOCK_PATRONS[source].find((patron) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [patron]),
  )
  const classTarget = (name: string, level: number) =>
    `class-feature|${name}|warlock|${source}|${level}|${source}`
  if (
    !owner ||
    entry.levels < owner.level ||
    !matchesNativeSubclassGain(
      cls,
      classTarget(source === 'phb' ? 'otherworldly patron' : 'warlock subclass', owner.level),
      owner.level,
    )
  )
    return undefined
  const subclass = findNativeSubclass(cls, owner)
  if (!subclass) return undefined

  const ownerKey = getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source)
  const byTarget = catalogs.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)
    : catalogs.subclassFeatureCandidates
  const candidates = (target: string) =>
    catalogs.subclassTargets || byTarget
      ? (byTarget?.get(target) ?? [])
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
  const exactBody = (feature: SubclassFeature | undefined, target: string, digest: string) =>
    !!digest &&
    !!feature &&
    getSubclassFeatureIdentity(feature) === target &&
    hasFeatureSourceShape(feature, subclassFields) &&
    Array.isArray(feature.entries) &&
    matchesFeatureEntryDigest(feature.entries, digest, false)
  const verified = (attached: SubclassFeature | undefined, target: string, digest: string) => {
    const mirrors = candidates(target)
    return attached &&
      exactBody(attached, target, digest) &&
      mirrors.length &&
      mirrors.every((row) => exactBody(row, target, digest))
      ? attached
      : undefined
  }

  const getDirectFeature = (target: string, digest: string) => {
    const gain = owner.direct.find((rule) => rule.target === target)
    if (!gain || entry.levels < gain.level) return undefined
    const parent = classTarget(
      source === 'phb' ? 'otherworldly patron feature' : 'subclass feature',
      gain.level,
    )
    return matchesNativeSubclassGain(cls, parent, gain.level, 'at-level')
      ? verified(getDirectSubclassFeatureReference(subclass, target)?.feature, target, digest)
      : undefined
  }

  const getNestedFeature = (target: string, digest: string) => {
    if (!owner.nested.includes(target)) return undefined
    // Intro prose may vary. Verify each unconditional nested declaration and its own body.
    const targetOf = (uid: unknown) =>
      typeof uid === 'string'
        ? decodeOptionalDeclaration(uid, 'subclassFeature')?.target
        : undefined
    const nestedFrom = (intro: SubclassFeature | undefined, target: string) => {
      if (
        !intro ||
        !hasFeatureSourceShape(intro, subclassFields) ||
        getSubclassFeatureIdentity(intro) !== owner.intro ||
        !Array.isArray(intro.entries)
      )
        return undefined
      const refs = intro.entries
        .map(record)
        .filter((row) => targetOf(row.subclassFeature) === target)
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
    return mirrors.length &&
      mirrors.every((row) => exactBody(nestedFrom(row, target), target, digest))
      ? verified(nestedFrom(intro, target), target, digest)
      : undefined
  }

  return { owner, subclass, getDirectFeature, getNestedFeature }
}

export function getCurrentStepsOfTheFey(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (!getNativeStepsOfTheFeyOwner(entry)) return undefined
  const current = getCurrentNativeWarlockPatronRules(cls, entry, catalogs)
  const feature = current?.getNestedFeature(STEPS_OF_THE_FEY_TARGET, STEPS_OF_THE_FEY_RULE_DIGEST)
  const blocks = current?.subclass.additionalSpells
  const innate = record(blocks?.[0]?.innate)
  const usage = record(innate._)
  const daily = record(usage.daily)
  const spells = daily.cha
  return feature &&
    blocks?.length === 1 &&
    Object.keys(innate).length === 1 &&
    Object.keys(usage).length === 1 &&
    Object.keys(daily).length === 1 &&
    Array.isArray(spells) &&
    spells.length === 1 &&
    typeof spells[0] === 'string' &&
    spells[0].trim().toLowerCase() === STEPS_OF_THE_FEY_SPELL.toLowerCase()
    ? feature
    : undefined
}
