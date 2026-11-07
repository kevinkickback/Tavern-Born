import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Spell5e, Subclass5e, SubclassFeature } from '@/types/5etools'
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

const inheritedOaths = [
  {
    name: 'Oath of the Crown',
    shortName: 'Crown',
    source: 'SCAG',
    schedule: '4d40067feefd858834bc3d7219eda2cda1a2dd7660fdfdae615d33a328a5087d',
    spells: '17c102a9c26ddc442e7e7d5fdb52e0881eceab1099d962b11b9f9715332bfb52',
  },
  {
    name: 'Oath of Conquest',
    shortName: 'Conquest',
    source: 'XGE',
    schedule: '92ac2ae14ba8ad3478a6a15bf5b98e81100a5c8d25339c2f9fb1ae71ee349b57',
    spells: '0dfc6fa280c940a787e560ad23108732eb3c1ba460093963e93b2d3d3153d518',
  },
  {
    name: 'Oath of Redemption',
    shortName: 'Redemption',
    source: 'XGE',
    schedule: '8697eda2ffb376262f6adc2b98e8a825b0a9741e39456463045cee03298954a8',
    spells: 'a1272471170bfef218166f2ba342fef7ecd24ea926c83915820b032f1b1b6f89',
  },
  {
    name: 'Oath of the Watchers',
    shortName: 'Watchers',
    source: 'TCE',
    schedule: '83aa954fafefee62f55dbb5dfe13e089557d3aca6dc193b562db649c84c0e224',
    spells: 'f20bcd5c70acf15951df725eadc0c07ff2c635c69a907c6c5688de909075d30d',
  },
]

function findOath(name: unknown, source: unknown) {
  if (typeof name !== 'string' || typeof source !== 'string') return undefined
  return inheritedOaths.find(
    (rule) => norm(name) === norm(rule.name) && norm(source) === norm(rule.source),
  )
}

function featureTarget(name: string, rule: (typeof inheritedOaths)[number]) {
  return `subclass-feature|${norm(name)}|paladin|phb|${norm(rule.shortName)}|${norm(rule.source)}|3|${norm(rule.source)}`
}

export function isRevisedInheritedOathOwner(entry: CharacterClassEntry) {
  return (
    norm(entry.name) === 'paladin' &&
    norm(entry.source) === 'xphb' &&
    !!findOath(entry.subclass, entry.subclassSource)
  )
}

/** Classic records prove the reprint relationship. Only the visible revised target can grant a spell. */
export function getCurrentOathSpellReprints(spells: Readonly<Record<string, Spell5e>> | undefined) {
  const proofs = new Map<string, number | undefined>()
  for (const spell of Object.values(spells ?? {})) {
    if (norm(spell.source) !== 'phb') continue
    const key = getSpellReferenceKey(spell.name, 'XPHB')
    const printings = Array.isArray(spell.reprintedAs)
      ? spell.reprintedAs.filter(
          (uid): uid is string =>
            typeof uid === 'string' && norm(parseSpellReference(uid).source) === 'xphb',
        )
      : []
    const valid =
      !proofs.has(key) &&
      spell.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
      printings.length === 1 &&
      isSourceQualifiedSpellReference(printings[0]) &&
      getSpellReferenceKey(printings[0]) === key
    proofs.set(key, valid ? spell.level : undefined)
  }
  return proofs
}

export function isInheritedOathSourceFeature(target: string | undefined) {
  return inheritedOaths.some(
    (rule) =>
      target === featureTarget(rule.name, rule) || target === featureTarget('Oath Spells', rule),
  )
}

export function isRevisedInheritedOathIntro(
  cls: Class5e,
  subclass: Subclass5e,
  target: string | undefined,
) {
  const rule = findOath(subclass.name, subclass.source)
  return (
    !!rule &&
    norm(cls.name) === 'paladin' &&
    norm(cls.source) === 'xphb' &&
    target === featureTarget(rule.name, rule)
  )
}

function hasExactCopy(rule: (typeof inheritedOaths)[number], copy: Record<string, unknown>) {
  return (
    copy.name === rule.name &&
    copy.shortName === rule.shortName &&
    copy.source === rule.source &&
    copy.className === 'Paladin' &&
    copy.classSource === 'PHB' &&
    !('_mod' in copy)
  )
}

/** A revised oath inherits its classic record. The raw copy cannot supply substitute spell data. */
export function auditInheritedOathSpellRoots(
  raw: Record<string, unknown>[],
  materialized: Record<string, unknown>[],
) {
  return materialized.map((row, index) => {
    if (
      typeof row.className !== 'string' ||
      typeof row.classSource !== 'string' ||
      norm(row.className) !== 'paladin' ||
      norm(row.classSource) !== 'xphb'
    )
      return row
    const rule = findOath(row.name, row.source)
    if (!rule) return row
    const original = raw[index]
    const bases = raw.filter(
      (base) =>
        base.name === rule.name &&
        base.shortName === rule.shortName &&
        base.source === rule.source &&
        base.className === 'Paladin' &&
        base.classSource === 'PHB',
    )
    const valid =
      original.shortName === rule.shortName &&
      hasExactCopy(rule, record(original._copy)) &&
      !('additionalSpells' in original) &&
      !('subclassFeatures' in original) &&
      bases.length === 1 &&
      !('_copy' in bases[0]) &&
      !bases[0].sourceIdentityConflict
    return valid ? row : { ...row, sourceIdentityConflict: true }
  })
}

export function hasRevisedInheritedOathSpells(cls: Class5e, subclass: Subclass5e) {
  const rule = findOath(subclass.name, subclass.source)
  if (
    !rule ||
    norm(cls.name) !== 'paladin' ||
    norm(cls.source) !== 'xphb' ||
    norm(subclass.className) !== 'paladin' ||
    norm(subclass.classSource) !== 'xphb' ||
    subclass.sourceIdentityConflict ||
    subclass.shortName !== rule.shortName ||
    !hasExactCopy(rule, record(record(subclass)._copy)) ||
    !matchesNativeSubclassGain(cls, 'class-feature|paladin subclass|paladin|xphb|3|xphb', 3)
  )
    return false

  const introTarget = featureTarget(rule.name, rule)
  const intro = getDirectSubclassFeatureReference(subclass, introTarget)?.feature
  if (
    !intro ||
    intro.isClassFeatureVariant ||
    intro.sourceIdentityConflict ||
    intro.featureOptionSourceConflict ||
    getSubclassFeatureIdentity(intro) !== introTarget ||
    !Array.isArray(intro.entries)
  )
    return false

  const target = featureTarget('Oath Spells', rule)
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
