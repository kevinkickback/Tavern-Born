import {
  formatSpellReference,
  getSpellReferenceKey,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { CharacterClassEntry } from '@/types/character'
import { type ParsedAdditionalSpellBlock, parseAdditionalSpellBlocks } from './additionalSpells'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  getDirectSubclassFeatureReference,
  getNativeSubclassIntroFeature,
  isInheritedClassicSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'
import type { SubclassSpellGrant } from './subclassSpells'

function getLaterRangerSpellFeature(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
  name: string,
  origin = cls.source,
) {
  const refs = subclass.subclassFeatureRefs?.filter((ref) => ref.name === name)
  const ref = refs?.[0]
  if (refs?.length !== 1 || !ref?.level || ref.level > classLevel) return undefined
  const target = getSubclassFeatureIdentity({
    name,
    className: cls.name,
    classSource: origin,
    subclassShortName: subclass.shortName,
    subclassSource: subclass.source,
    source: subclass.source,
    level: ref.level,
  })
  const feature = target && getDirectSubclassFeatureReference(subclass, target)?.feature
  return target &&
    feature &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    getCurrentNativeSubclassGain(cls, ref.level) &&
    feature.entries
    ? { name, target, level: ref.level, entries: feature.entries }
    : undefined
}

/** This later feature has no structured spell grant in either printing. */
function getFeyReinforcements(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
  revised: boolean,
): SubclassSpellGrant | undefined {
  const feature = getLaterRangerSpellFeature(cls, subclass, classLevel, 'Fey Reinforcements')
  if (!feature || feature.entries.length !== (revised ? 2 : 3)) return undefined
  const [casting, duration] = feature.entries.slice(revised ? 0 : 1)
  if (typeof casting !== 'string') return undefined
  const spell = revised
    ? /^You can cast \{@spell ([^{}|]+\|XPHB)\} without a Material component\. You can also cast it (once|twice|three times) without a spell slot, and you regain the ability to cast it in this way when you finish a \{@variantrule Long Rest\|XPHB\}\.$/.exec(
        casting,
      )
    : /^The royal courts of the Feywild have blessed you with the assistance of fey beings: you know \{@spell ([^{}|]+\|tce)\}\. It doesn't count against the number of ranger spells you know, and you can cast it without a material component\. You can also cast it (once|twice|three times) without a spell slot, and you regain the ability to do so when you finish a long rest\.$/.exec(
        casting,
      )
  const concentration = revised ? 'Concentration|XPHB' : 'concentration'
  if (
    !spell ||
    duration !==
      `Whenever you start casting the spell, you can modify it so that it doesn't require {@status ${concentration}}. If you do so, the spell's duration becomes 1 minute for that casting.`
  )
    return undefined
  const casts = ['once', 'twice', 'three times'].indexOf(spell[2]) + 1
  return {
    spellName: parseSpellToken(spell[1]).name,
    level: feature.level,
    isCantrip: false,
    mode: revised ? 'prepared' : 'known',
    feature: {
      name: feature.name,
      target: feature.target,
      castingNote: `Fey Reinforcements: Cast without a Material component. ${casts} slot-free ${casts === 1 ? 'cast' : 'casts'} per Long Rest. When you start casting, you can waive Concentration for a duration of 1 minute.`,
    },
  }
}

export function applyFeyWandererSpellUpgrades(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
  grants: SubclassSpellGrant[],
) {
  const classic = cls.source === 'PHB' && subclass.source === 'TCE'
  const revised = cls.source === 'XPHB' && subclass.source === 'XPHB'
  if (
    cls.name !== 'Ranger' ||
    subclass.shortName !== 'Fey Wanderer' ||
    (!classic && !revised) ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass
  )
    return grants
  const reinforcements = getFeyReinforcements(cls, subclass, classLevel, revised)
  const wandering = getLaterRangerSpellFeature(cls, subclass, classLevel, 'Misty Wanderer')
  const casting = wandering?.entries[revised ? 0 : 1]
  const misty =
    typeof casting === 'string' &&
    /^(?:You can slip in and out of the Feywild to move in a blink of an eye: you|You) can cast \{@spell ([^{}]+)\} without expending a spell slot\. You can do so a number of times equal to your Wisdom modifier \(minimum of (once|twice)\), and you regain all expended uses when you finish a (?:\{@variantrule Long Rest\|XPHB\}|long rest)\.$/.exec(
      casting,
    )
  const qualify = (reference: string) =>
    formatSpellReference(reference, parseSpellReference(reference).source ?? cls.source)
  const notes = [
    ...(reinforcements && revised
      ? [
          {
            reference: reinforcements.spellName,
            level: reinforcements.level,
            feature: reinforcements.feature,
          },
        ]
      : []),
    ...(wandering && misty
      ? [
          {
            reference: qualify(misty[1]),
            level: wandering.level,
            feature: {
              name: wandering.name,
              target: wandering.target,
              castingNote: `Misty Wanderer: Slot-free casts equal to your Wisdom modifier (minimum ${misty[2]}). Regain all uses on a Long Rest.`,
            },
          },
        ]
      : []),
  ]
  const current = grants.map((grant) => {
    const reference = qualify(grant.spellName)
    const later = notes.find(
      (note) =>
        note.level >= grant.level &&
        getSpellReferenceKey(note.reference) === getSpellReferenceKey(reference),
    )
    return later ? { ...grant, spellName: reference, feature: later.feature } : grant
  })
  return classic && reinforcements ? [...current, reinforcements] : current
}

export function getRangerEtherealStep(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant | undefined {
  const inherited = cls.source === 'XPHB'
  if (
    cls.name !== 'Ranger' ||
    (cls.source !== 'PHB' && !inherited) ||
    subclass.shortName !== 'Horizon Walker' ||
    subclass.source !== 'XGE' ||
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    (inherited ? !isInheritedClassicSubclass(subclass) : '_copy' in subclass)
  )
    return undefined
  const feature = getLaterRangerSpellFeature(cls, subclass, classLevel, 'Ethereal Step', 'PHB')
  if (!feature || feature.entries.length !== 2) return undefined
  const [casting, recovery] = feature.entries
  const spell =
    typeof casting === 'string' &&
    /^At (\d+)(?:st|nd|rd|th) level, you learn to step through the Ethereal Plane\. As a bonus action, you can cast the \{@spell ([^{}|]+)\} spell with this feature, without expending a spell slot, but the spell ends at the end of the current turn\.$/.exec(
      casting,
    )
  if (
    !spell ||
    Number(spell[1]) !== feature.level ||
    recovery !==
      "Once you use this feature, you can't use it again until you finish a short or long rest."
  )
    return undefined
  return {
    spellName: formatSpellReference(spell[2], inherited ? 'XPHB' : 'PHB'),
    level: feature.level,
    isCantrip: false,
    mode: 'cast-only',
    castOnly: { castingTime: 'Bonus Action', duration: 'Until end of current turn' },
    ...(inherited && { requiresClassicReprint: true }),
    feature: {
      name: feature.name,
      target: feature.target,
      castingNote:
        'Ethereal Step: One slot-free Bonus Action cast per Short or Long Rest. The spell ends at the end of the current turn.',
    },
  }
}

const revisedSpellOwners = new Map([
  ['Fey Wanderer', 'XPHB'],
  ['Gloom Stalker', 'XPHB'],
  ['Winter Walker', 'FRHoF'],
  ['Hollow Warden', 'RHW'],
])

const legacySpellOwners = new Map([
  ['Gloom Stalker', 'XGE'],
  ['Horizon Walker', 'XGE'],
  ['Monster Slayer', 'XGE'],
  ['Fey Wanderer', 'TCE'],
  ['Swarmkeeper', 'TCE'],
  ['Drakewarden', 'FTD'],
])

export function isRevisedInheritedRangerSpellOwner(entry: CharacterClassEntry) {
  return (
    norm(entry.name) === 'ranger' &&
    norm(entry.source) === 'xphb' &&
    [...legacySpellOwners].some(
      ([name, source]) =>
        norm(entry.subclass) === norm(name) && norm(entry.subclassSource) === norm(source),
    )
  )
}

function readRangerSpellTable(entries: readonly unknown[], name: string, gain: number) {
  const tables = entries
    .map(record)
    .filter(
      (entry) =>
        entry.type === 'table' &&
        (entry.caption === name ||
          (!entry.caption &&
            Array.isArray(entry.colLabels) &&
            entry.colLabels[0] === 'Ranger Level')),
    )
  const rows = tables[0]?.rows
  if (tables.length !== 1 || !Array.isArray(rows) || !rows.length) return undefined
  const declared = new Map<number, string>()
  for (const row of rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 2 ||
      typeof row[0] !== 'string' ||
      typeof row[1] !== 'string'
    )
      return undefined
    const level = Number(/^(\d+)(?:st|nd|rd|th)?$/.exec(row[0])?.[1])
    const spell = /^\{@spell ([^{}]+)\}$/.exec(row[1])?.[1]
    if (!spell || !Number.isInteger(level) || level < gain || level > 20 || declared.has(level))
      return undefined
    declared.set(level, parseSpellToken(spell).name)
  }
  return declared
}

function isDirectRangerSpellBlock(block: ParsedAdditionalSpellBlock) {
  return (
    !block.ability &&
    !block.abilityOptions &&
    !block.choices.length &&
    !block.expanded?.length &&
    block.scheduleIdentity.every((identity) => {
      const [, , usage, members] = JSON.parse(identity) as [string, number, string, string[]]
      return (
        usage === 'direct' &&
        members.every((member) => {
          const [, modifier] = JSON.parse(member) as [string, string | null]
          return modifier === null || modifier === 'c'
        })
      )
    })
  )
}

/** Match structured schedules to the current tables and their always-prepared rules. */
export function getRevisedRangerSubclassSpells(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] | undefined {
  if (
    cls.name !== 'Ranger' ||
    cls.source !== 'XPHB' ||
    revisedSpellOwners.get(subclass.shortName) !== subclass.source
  )
    return undefined
  if (cls.sourceIdentityConflict || subclass.sourceIdentityConflict || '_copy' in subclass)
    return []
  const gain = getCurrentNativeSubclassGain(cls)?.level
  if (!gain || classLevel < gain) return []
  const name = `${subclass.shortName} Spells`
  const feature = getNativeSubclassIntroFeature(cls, subclass, gain, name)
  if (
    !feature?.entries?.some(
      (entry) =>
        entry ===
          `When you reach a Ranger level specified in the ${name} table, you thereafter always have the listed spells prepared.` ||
        entry ===
          `When you reach a Ranger level specified in the ${name} table, you thereafter always have the listed spell prepared.`,
    )
  )
    return []
  const declared = readRangerSpellTable(feature.entries, name, gain)
  if (!declared) return []
  try {
    const [block, ...others] = parseAdditionalSpellBlocks(
      subclass.additionalSpells as AdditionalSpellBlock[],
    )
    if (
      !block ||
      others.length ||
      !isDirectRangerSpellBlock(block) ||
      block.grants.length !== declared.size
    )
      return []
    const matched = new Set<number>()
    const grants: SubclassSpellGrant[] = []
    for (const spell of block.grants) {
      const declaredSpell = declared.get(spell.level)
      if (
        spell.isCantrip ||
        (spell.source !== 'prepared' &&
          (spell.source !== 'known' || subclass.shortName !== 'Fey Wanderer')) ||
        !declaredSpell ||
        matched.has(spell.level) ||
        getSpellReferenceKey(spell.spellName) !== getSpellReferenceKey(declaredSpell)
      )
        return []
      matched.add(spell.level)
      if (spell.level <= classLevel)
        grants.push({
          spellName: declaredSpell,
          level: spell.level,
          isCantrip: false,
          mode: 'prepared',
          feature: { name, target: feature.target },
        })
    }
    return grants
  } catch {
    return []
  }
}

/** Match the classic spell declaration, including when its grant needs a revised printing. */
export function getClassicRangerSubclassSpells(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
): SubclassSpellGrant[] | undefined {
  if (
    cls.name !== 'Ranger' ||
    (cls.source !== 'PHB' && cls.source !== 'XPHB') ||
    legacySpellOwners.get(subclass.shortName) !== subclass.source
  )
    return undefined
  const inherited = cls.source === 'XPHB'
  if (
    cls.sourceIdentityConflict ||
    subclass.sourceIdentityConflict ||
    (inherited ? !isInheritedClassicSubclass(subclass) : '_copy' in subclass)
  )
    return []
  const gain = getCurrentNativeSubclassGain(cls)?.level
  if (!gain || classLevel < gain) return []
  const drake = subclass.shortName === 'Drakewarden'
  const swarm = subclass.shortName === 'Swarmkeeper'
  const name = drake ? 'Draconic Gift' : `${subclass.shortName} Magic`
  const feature = getNativeSubclassIntroFeature(cls, subclass, gain, name, 'PHB')
  if (!feature?.entries) return []
  const table = `${subclass.shortName} Spells`
  const learned = `You learn an additional spell when you reach certain levels in this class, as shown in the ${table} table. Each spell counts as a ranger spell for you, but it doesn't count against the number of ranger spells you know.`
  const learnedFromGain = `you learn an additional spell when you reach certain levels in this class, as shown in the ${table} table. The spell counts as a ranger spell for you, but it doesn't count against the number of ranger spells you know.`
  const swarmLearned = `You also learn an additional spell of 1st level or higher when you reach certain levels in this class, as shown in the ${table} table. Each spell counts as a ranger spell for you, but it doesn't count against the number of ranger spells you know.`
  if (
    !drake &&
    !feature.entries.some((entry) => {
      if (swarm) return entry === swarmLearned
      if (subclass.shortName === 'Fey Wanderer') return entry === learned
      if (typeof entry !== 'string') return false
      const start = /^Starting at (\d+)(?:st|nd|rd|th) level, /.exec(entry)
      return start && Number(start[1]) === gain && entry.slice(start[0].length) === learnedFromGain
    })
  )
    return []
  const declared = drake
    ? new Map<number, string>()
    : readRangerSpellTable(feature.entries, table, gain)
  if (!declared) return []
  const cantripEntries = drake
    ? feature.entries
        .map(record)
        .flatMap((row) =>
          row.type === 'list' && Array.isArray(row.items)
            ? row.items.map(record).map((item) => item.entry)
            : [],
        )
    : swarm
      ? feature.entries
      : []
  const cantrips = cantripEntries.flatMap((entry) => {
    const match =
      typeof entry === 'string' &&
      /^You learn the \{@spell ([^{}]+)\} cantrip(?:, which is a ranger spell for you\.| if you don't already know it\. When you cast it, the hand takes the form of your swarming nature spirits\.)$/.exec(
        entry,
      )
    return match ? [parseSpellToken(match[1]).name] : []
  })
  if (cantrips.length !== (drake || swarm ? 1 : 0)) return []
  try {
    const [block, ...others] = parseAdditionalSpellBlocks(
      subclass.additionalSpells as AdditionalSpellBlock[],
    )
    if (
      !block ||
      others.length ||
      !isDirectRangerSpellBlock(block) ||
      block.grants.length !== declared.size + cantrips.length
    )
      return []
    const matched = new Set<string>()
    const grants: SubclassSpellGrant[] = []
    for (const spell of block.grants) {
      const current = spell.isCantrip
        ? spell.level === gain
          ? cantrips[0]
          : undefined
        : declared.get(spell.level)
      const source = current && parseSpellReference(current).source
      const key = `${spell.level}:${spell.isCantrip}`
      if (
        !current ||
        spell.source !== 'known' ||
        matched.has(key) ||
        (source && norm(source) !== 'phb') ||
        getSpellReferenceKey(
          spell.spellName,
          parseSpellReference(spell.spellName).source ?? 'PHB',
        ) !== getSpellReferenceKey(current, 'PHB')
      )
        return []
      matched.add(key)
      if (spell.level <= classLevel)
        grants.push({
          spellName: formatSpellReference(current, inherited ? 'XPHB' : 'PHB'),
          level: spell.level,
          isCantrip: spell.isCantrip,
          ...(spell.isCantrip && { expectedSpellLevel: 0 }),
          ...(inherited && { requiresClassicReprint: true }),
          mode: spell.isCantrip || !inherited ? 'known' : 'prepared',
          feature: { name, target: feature.target },
        })
    }
    return grants
  } catch {
    return []
  }
}
