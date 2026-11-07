import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

// The source has no feature reference on the prepared schedule itself. Only these
// authored Arcana features declare that the choices become domain spells.
const owners = [
  { printing: 'phb', origin: 'phb', source: 'scag', name: 'Arcane Mastery' },
  { printing: 'xphb', origin: 'phb', source: 'scag', name: 'Arcane Mastery' },
  { printing: 'xphb', origin: 'xphb', source: 'au', name: 'Magical Mastery' },
] as const

const prefix = 'arcana-prepared:v1:'
const maximumTargetLength = 1200
// Bound the total choices contributed by one external spell schedule.
const maximumChoices = 20
const getOwner = (printing: string, source: string) =>
  owners.find((row) => row.printing === printing && row.source === source)
const filterKey = (classes: string[]) => [...new Set(classes.map(norm))].sort()

export function getClericArcanaSpellRule(slot: ManagedClassSpellSlot) {
  if (!Array.isArray(slot) || slot.length !== 5) return undefined
  const [owner, domain, target, level, ordinal] = slot
  if (
    !Array.isArray(owner) ||
    owner.length !== 5 ||
    owner[0] !== 'subclass' ||
    owner[1] !== 'cleric' ||
    owner[3] !== 'arcana domain' ||
    domain !== 'class-known' ||
    typeof target !== 'string' ||
    target.length > maximumTargetLength ||
    !target.startsWith(prefix) ||
    !Number.isInteger(ordinal) ||
    ordinal < 0 ||
    ordinal >= maximumChoices
  )
    return undefined
  const rule = getOwner(owner[2], owner[4])
  if (!rule) return undefined
  try {
    const filter = JSON.parse(target.slice(prefix.length))
    if (!Array.isArray(filter) || filter.length !== 3) return undefined
    const [feature, rank, classes] = filter
    if (
      feature !==
        `subclass-feature|${norm(rule.name)}|cleric|${rule.origin}|arcana|${rule.source}|${level}|${rule.source}` ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > 20 ||
      !Number.isInteger(rank) ||
      rank < 1 ||
      rank > 9 ||
      !Array.isArray(classes) ||
      !classes.length ||
      classes.some((row) => typeof row !== 'string' || !row || row !== norm(row)) ||
      JSON.stringify(classes) !== JSON.stringify(filterKey(classes)) ||
      target !== prefix + JSON.stringify(filter)
    )
      return undefined
    return { ...rule, rank, classes: classes as string[] }
  } catch {
    return undefined
  }
}

export function getClericArcanaSpellSlots(entry: CharacterClassEntry, cls: Class5e | undefined) {
  const rule = getOwner(norm(entry.source), norm(entry.subclassSource))
  if (
    !rule ||
    !cls ||
    cls.name !== 'Cleric' ||
    norm(cls.source) !== rule.printing ||
    norm(entry.name) !== 'cleric' ||
    norm(entry.subclass) !== 'arcana domain' ||
    !getCurrentNativeSubclassGain(cls)
  )
    return []
  const domains = cls.subclasses?.filter(
    (row) => norm(row.name) === 'arcana domain' && norm(row.source) === rule.source,
  )
  const domain = domains?.length === 1 ? domains[0] : undefined
  const copy = record(domain?._copy)
  if (
    !domain ||
    domain.sourceIdentityConflict ||
    norm(domain.shortName) !== 'arcana' ||
    norm(domain.className) !== 'cleric' ||
    norm(domain.classSource) !== rule.printing ||
    (domain.spellcastingAbility && domain.spellcastingAbility !== cls.spellcastingAbility) ||
    (rule.origin === rule.printing
      ? !!domain._copy
      : copy.name !== 'Arcana Domain' ||
        copy.source !== 'SCAG' ||
        copy.shortName !== 'Arcana' ||
        copy.className !== 'Cleric' ||
        copy.classSource !== 'PHB')
  )
    return []
  const refs = domain.subclassFeatureRefs?.filter(
    (row) =>
      norm(row.name) === norm(rule.name) &&
      norm(row.classSource) === rule.origin &&
      norm(row.subclassSource) === rule.source &&
      norm(row.source) === rule.source,
  )
  const uid = refs?.length === 1 ? refs[0].ref : undefined
  const declaration = uid && decodeOptionalDeclaration(uid, 'subclassFeature')
  const level = declaration && declaration.decoded.level
  if (!declaration || !level || level > entry.levels || !getCurrentNativeSubclassGain(cls, level))
    return []
  const producer = getDirectSubclassFeatureReference(domain, declaration.target)?.feature
  if (
    !producer ||
    producer.sourceIdentityConflict ||
    producer.featureOptionSourceConflict ||
    producer.isClassFeatureVariant ||
    '_copy' in producer ||
    getSubclassFeatureIdentity(producer) !== declaration.target
  )
    return []
  try {
    const blocks = parseAdditionalSpellBlocks(
      domain.additionalSpells as AdditionalSpellBlock[] | undefined,
    )
    const [block] = blocks
    if (
      blocks.length !== 1 ||
      block.abilityOptions ||
      (block.ability && block.ability !== cls.spellcastingAbility)
    )
      return []
    const choices = block.choices.filter((row) => row.source === 'prepared')
    const addresses = new Set<string>()
    const slots: ManagedClassSpellSlot[] = []
    for (const { count, filter, usage, level: gain } of choices) {
      if (
        gain !== level ||
        usage !== 'direct' ||
        !filter?.level ||
        !filter.classes.length ||
        slots.length + count > maximumChoices
      )
        return []
      const target =
        prefix + JSON.stringify([declaration.target, filter.level, filterKey(filter.classes)])
      if (addresses.has(target)) return []
      addresses.add(target)
      for (let ordinal = 0; ordinal < count; ordinal++) {
        const slot: ManagedClassSpellSlot = [
          ['subclass', 'cleric', rule.printing, 'arcana domain', rule.source],
          'class-known',
          target,
          level,
          ordinal,
        ]
        if (!getClericArcanaSpellRule(slot)) return []
        slots.push(slot)
      }
    }
    return slots
  } catch {
    return []
  }
}
