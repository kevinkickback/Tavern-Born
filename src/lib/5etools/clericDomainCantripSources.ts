import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity, isExactSubclassFeatureReference } from './classFeatureIdentity'
import { getFeatureSourceDigest, matchesFeatureEntryDigest } from './featureSourceAudit'
import {
  getExactClericDomainIntro,
  hasRevisedInheritedDomainSpellRoot,
} from './legacyClericDomainSpells'
import { getCurrentNativeSubclassGain, matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

const classicNature = {
  subclass: 'nature domain',
  shortName: 'nature',
  source: 'phb',
  name: 'Acolyte of Nature',
  intro: 'a13029ba8f1aa44abc0c408161e4c8fd186875f116fa8970c65fea8b1784cbc5',
  producer: 'a333dc9b77f5dfb06f7ce040f476bf0263109e41d5c39b104b42cb0a170aea70',
} as const

const classicStrength = {
  subclass: 'strength domain (psa)',
  shortName: 'strength (psa)',
  source: 'psa',
  name: 'Acolyte of Strength',
  intro: '28dac83f6ac1c0f44cf5e4c861e5f375da79279842bef3f3c71c6bc53110f0e6',
  producer: '8016ac673ade8b69f3ef6b76464bc136ff2732129528f1339bbfdcec77d6f135',
} as const

const classicArcana = {
  subclass: 'arcana domain',
  shortName: 'arcana',
  source: 'scag',
  name: 'Arcane Initiate',
  intro: '58f55716eec8ee6f65523cd8039f3a787f7783c370374c9d02da172cc07271a2',
  producer: '0787b6fbfddec98cd53ac175bb1850859bd36889d312c8f72edb0423ca39b0da',
} as const

export const clericDomainCantrips = [
  { ...classicNature, printing: 'phb', origin: 'phb' },
  { ...classicNature, printing: 'xphb', origin: 'phb' },
  { ...classicStrength, printing: 'phb', origin: 'phb' },
  { ...classicStrength, printing: 'xphb', origin: 'phb' },
  { ...classicArcana, printing: 'phb', origin: 'phb' },
  { ...classicArcana, printing: 'xphb', origin: 'phb' },
  {
    subclass: 'death domain',
    shortName: 'death',
    source: 'dmg',
    printing: 'phb',
    origin: 'phb',
    name: 'Reaper',
    intro: '07ae393d48cd9265164db3b75792a6188f67f1c128963e227384033e9051d4f6',
    producer: 'fb93466fd71d5ef54b002f71b686ade73ba54d3df35b4446f58d10150f0f7ff0',
  },
  {
    subclass: 'arcana domain',
    shortName: 'arcana',
    source: 'au',
    printing: 'xphb',
    origin: 'xphb',
    name: 'Student of Arcana',
    intro: '5494936d1a987f4743e054bed29ef946377fc6991387e79af63fae3161103942',
    producer: '08c4d06e11f9585e6e79ede71ee9231fc13bcc77bc7f6258c35e5121abe1d9f3',
  },
] as const

type CantripRule = (typeof clericDomainCantrips)[number]
export const maximumDomainCantrips = 20
const featureTarget = (
  rule: { shortName: string; source: string },
  name: string,
  printing: string,
  level: number,
) =>
  `subclass-feature|${name.toLowerCase()}|cleric|${printing}|${rule.shortName}|${rule.source}|${level}|${rule.source}`

export function matchesClericCantripTarget(rule: CantripRule, target: string, gain?: number) {
  const level = Number(target.split('|')[6])
  return (
    Number.isInteger(level) &&
    level >= 1 &&
    level <= 20 &&
    (gain === undefined || rule.origin !== rule.printing || level === gain) &&
    target === featureTarget(rule, rule.name, rule.origin, level)
  )
}

export function getClericDomainCantripSource(
  cls: Class5e,
  subclass: Subclass5e,
  rule: CantripRule,
) {
  const gain = getCurrentNativeSubclassGain(cls)?.level
  const blocks = subclass.additionalSpells ?? []
  if (
    !gain ||
    !Array.isArray(blocks) ||
    blocks.length !== 1 ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    cls.spellcastingAbility !== 'wis' ||
    (subclass.spellcastingAbility !== undefined && subclass.spellcastingAbility !== 'wis') ||
    (rule.origin === rule.printing
      ? !!subclass._copy
      : !hasRevisedInheritedDomainSpellRoot(cls, subclass))
  )
    return undefined
  const intro = getExactClericDomainIntro(
    subclass,
    featureTarget(rule, rule.subclass, rule.printing, gain),
    rule.intro,
    rule.origin === rule.printing ? normalizeIntroGain(rule, gain) : undefined,
  )
  const targets = (intro?.entries ?? []).flatMap((entry) => {
    const row = record(entry)
    const ref =
      row.type === 'refSubclassFeature' && typeof row.subclassFeature === 'string'
        ? decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')
        : undefined
    return ref && matchesClericCantripTarget(rule, ref.target, gain) ? [ref] : []
  })
  const [ref] = targets
  if (
    !intro ||
    targets.length !== 1 ||
    !ref.decoded.level ||
    !hasNestedCantripSource(
      intro,
      ref.target,
      rule.producer,
      rule.origin === 'phb' && rule.printing === 'phb' && gain !== 1
        ? (entries) =>
            entries.map((entry) =>
              typeof entry === 'string'
                ? entry.replace(new RegExp(`\\b${gain}(?:st|nd|rd|th) level\\b`), '1st level')
                : entry,
            )
        : undefined,
    )
  )
    return undefined
  return readCantripChoice(
    blocks[0] as AdditionalSpellBlock,
    ref.decoded.level,
    rule,
    gain,
    ref.target,
  )
}

// The proof retains the exact authored rule. The runtime level follows a matching direct UID.
function normalizeIntroGain(rule: CantripRule, level: number) {
  const proofLevel = rule.printing === 'phb' ? 1 : 3
  if (level === proofLevel) return undefined
  return (entries: unknown[]) =>
    entries.map((entry) => {
      const row = record(entry)
      const uid = row.subclassFeature
      if (row.type !== 'refSubclassFeature' || typeof uid !== 'string') return entry
      const ref = decodeOptionalDeclaration(uid, 'subclassFeature')
      if (!ref || ref.target !== featureTarget(rule, ref.decoded.name, rule.printing, level))
        return entry
      const parts = uid.split('|')
      parts[5] = String(proofLevel)
      return { ...row, subclassFeature: parts.join('|') }
    })
}

function readCantripChoice(
  block: AdditionalSpellBlock,
  level: number,
  rule: CantripRule,
  gain: number,
  target: string,
) {
  const known = record(block?.known)
  const entries = known[String(level)]
  if (
    Object.keys(known).length !== 1 ||
    Object.keys(block).some((key) => !['known', 'prepared', 'ability'].includes(key)) ||
    (block.ability !== undefined && block.ability !== 'wis')
  )
    return undefined
  const list = Array.isArray(entries) ? entries : record(entries)._
  if (!Array.isArray(entries) && Object.keys(record(entries)).length !== 1) return undefined
  if (!Array.isArray(list) || list.length !== 1) return undefined
  const entry = record(list[0])
  const rawFilter = entry.choose
  if (typeof rawFilter !== 'string') return undefined
  const parts = rawFilter.split('|')
  const school = parts.find((part) => part.startsWith('school='))?.slice(7)
  if (school !== undefined && (rule.shortName !== 'death' || !/^[ACDEINTV]$/.test(school)))
    return undefined
  const filter = school ? parts.filter((part) => part !== `school=${school}`).join('|') : rawFilter
  if (school && parts.length - filter.split('|').length !== 1) return undefined
  try {
    const [parsed] = parseAdditionalSpellBlocks([
      { known: { [level]: [{ ...entry, choose: filter }] } },
    ])
    const [choice] = parsed.choices
    if (
      !choice?.isCantrip ||
      !choice.filter ||
      choice.count > maximumDomainCantrips ||
      (!choice.filter.classes.length && !school)
    )
      return undefined
    return { choice, school, gain, target }
  } catch {
    return undefined
  }
}

function hasNestedCantripSource(
  intro: SubclassFeature,
  target: string,
  digest: string,
  normalize: (entries: unknown[]) => unknown[] = (entries) => entries,
) {
  const producers = (intro.entries ?? []).map(record).filter((row) => {
    const feature = row.feature as SubclassFeature | undefined
    return (
      row.type === 'refSubclassFeature' && feature && getSubclassFeatureIdentity(feature) === target
    )
  })
  const producer = producers[0]
  const feature = producer?.feature as SubclassFeature | undefined
  return (
    producers.length === 1 &&
    typeof producer.subclassFeature === 'string' &&
    isExactSubclassFeatureReference(producer, producer.subclassFeature) &&
    !!feature &&
    isExactSubclassFeatureReference(record(feature), producer.subclassFeature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    !('_copy' in feature) &&
    Array.isArray(feature.entries) &&
    matchesFeatureEntryDigest(normalize(feature.entries), digest)
  )
}

export function hasInheritedGraveCantrip(subclass: Subclass5e, gain: number) {
  const intro = getExactClericDomainIntro(
    subclass,
    `subclass-feature|grave domain|cleric|xphb|grave|xge|${gain}|xge`,
    '103fa8bb83e2799e6943b766a0a9e99965aa0f8262926039f8cd514349da20ff',
  )
  return (
    !!intro &&
    hasNestedCantripSource(
      intro,
      'subclass-feature|circle of mortality|cleric|phb|grave|xge|1|xge',
      'cc806c499ac207a05b6556e332a4fc9245e447e359d73cade78d2bb5dc110bc9',
    )
  )
}

export function hasRevisedGravePreparedCantrip(cls: Class5e, subclass: Subclass5e) {
  if (
    cls.name !== 'Cleric' ||
    cls.source !== 'XPHB' ||
    cls.sourceIdentityConflict ||
    subclass.name !== 'Grave Domain' ||
    subclass.shortName !== 'Grave' ||
    subclass.source !== 'RHW' ||
    subclass.className !== 'Cleric' ||
    subclass.classSource !== 'XPHB' ||
    subclass._copy ||
    subclass.sourceIdentityConflict ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !==
      'd9dc14ab2714da217b789f49c75fbde73c84d8047fe57a8f09f955a2e86d6e45' ||
    !matchesNativeSubclassGain(cls, 'class-feature|cleric subclass|cleric|xphb|3|xphb', 3)
  )
    return false
  const intro = getExactClericDomainIntro(
    subclass,
    'subclass-feature|grave domain|cleric|xphb|grave|rhw|3|rhw',
    '7d4858ba1624d936d70eda5b4129a7687fb40fceefa8f29f0e8d40165c9bb089',
  )
  return (
    !!intro &&
    hasNestedCantripSource(
      intro,
      'subclass-feature|grave domain spells|cleric|xphb|grave|rhw|3|rhw',
      '1e3ce7667e2fa1eb8842eaa52a50d0971cefc474147c20a24148b4d21c865e83',
    )
  )
}

export function hasClassicLightBonusCantrip(cls: Class5e, subclass: Subclass5e) {
  if (
    cls.name !== 'Cleric' ||
    cls.source !== 'PHB' ||
    cls.sourceIdentityConflict ||
    subclass.name !== 'Light Domain' ||
    subclass.shortName !== 'Light' ||
    subclass.source !== 'PHB' ||
    subclass.className !== 'Cleric' ||
    subclass.classSource !== 'PHB' ||
    subclass._copy ||
    subclass.sourceIdentityConflict ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !==
      '21bb0360c89ec470b23bed714cd1363145c6ec76b021b3e77829bca3619edc93' ||
    !matchesNativeSubclassGain(cls, 'class-feature|divine domain|cleric|phb|1|phb', 1)
  )
    return false
  const intro = getExactClericDomainIntro(
    subclass,
    'subclass-feature|light domain|cleric|phb|light|phb|1|phb',
    '5042d23a43ce1b882a6b0094ee766a96a154c610af7e61e3029cd64d6bacb26b',
  )
  return (
    !!intro &&
    hasNestedCantripSource(
      intro,
      'subclass-feature|bonus cantrip|cleric|phb|light|phb|1|phb',
      '6b802cbfdf4970f960dac088c11b905d2e50286fc992f738b5600f95f800c2f2',
    )
  )
}
