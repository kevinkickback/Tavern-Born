import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { getArcaneArcherLoreIdentity } from './arcaneArcherCantripSource'
import { GIANT_POWER_TARGET } from './barbarianPathChoiceIdentity'
import { BARD_PRIMAL_LORE_TARGET } from './bardCollegeFeatures'
import { LAND_BONUS_REF, LAND_BONUS_TARGET } from './circleOfTheLand'
import { getClassOrderById } from './classOrderIdentity'
import {
  clericDomainCantrips,
  matchesClericCantripTarget,
  maximumDomainCantrips,
} from './clericDomainCantripSources'
import {
  getRevisedInvocationPoolId,
  isRevisedInvocationPoolId,
} from './revisedInvocationPoolIdentity'
import { wizardIllusionCantrips } from './wizardTraditionSpellSources'

export type SelectedFeatureSpellAddress = [
  choiceId: string,
  entityType: 'optionalFeature' | 'feat' | 'classFeature' | 'subclassFeature',
  name: string,
  source: string,
  ref: string | null,
  block: number,
  descriptor: number,
]

const prefix = 'feature-spells:v1:'
const normalized = (value: unknown): value is string =>
  typeof value === 'string' && !!value && value === value.trim().toLowerCase()

export const selectedFeatureSpellAddress = (parts: SelectedFeatureSpellAddress) =>
  prefix + JSON.stringify(parts)

const LAND_BONUS_SPELL_ADDRESS = selectedFeatureSpellAddress([
  LAND_BONUS_TARGET,
  'subclassFeature',
  'bonus cantrip',
  'phb',
  LAND_BONUS_REF,
  0,
  0,
])
export const LAND_BONUS_SPELL_SLOT: ManagedClassSpellSlot = [
  ['subclass', 'druid', 'phb', 'circle of the land', 'phb'],
  'feature-cantrip',
  LAND_BONUS_SPELL_ADDRESS,
  2,
  0,
]

const BARD_PRIMAL_LORE_SPELL_ADDRESS = selectedFeatureSpellAddress([
  BARD_PRIMAL_LORE_TARGET,
  'subclassFeature',
  'primal lore',
  'frhof',
  BARD_PRIMAL_LORE_TARGET,
  0,
  0,
])
export const BARD_PRIMAL_LORE_SPELL_SLOT: ManagedClassSpellSlot = [
  ['subclass', 'bard', 'xphb', 'college of the moon', 'frhof'],
  'feature-cantrip',
  BARD_PRIMAL_LORE_SPELL_ADDRESS,
  3,
  0,
]

export const wizardIllusionCantripSlots = wizardIllusionCantrips.map((rule) => ({
  rule,
  slot: [
    ['subclass', 'wizard', rule.source, rule.subclass, rule.source],
    'feature-cantrip',
    selectedFeatureSpellAddress([
      rule.target,
      'subclassFeature',
      norm(rule.name),
      rule.source,
      rule.target.split('|').slice(1).join('|'),
      0,
      0,
    ]),
    rule.level,
    0,
  ] satisfies ManagedClassSpellSlot,
}))
export const giantPowerSpellSlots = (['phb', 'xphb'] as const).map(
  (source): ManagedClassSpellSlot => [
    ['subclass', 'barbarian', source, 'path of the giant', 'bgg'],
    'feature-cantrip',
    selectedFeatureSpellAddress([
      GIANT_POWER_TARGET,
      'subclassFeature',
      'giant power',
      'bgg',
      GIANT_POWER_TARGET.split('|').slice(1).join('|'),
      0,
      0,
    ]),
    3,
    0,
  ],
)

export const isGiantPowerSpellSlot = (slot: ManagedClassSpellSlot) =>
  giantPowerSpellSlots.some((row) => row[2] === slot[2] && row[0][2] === slot[0][2])

export function getClericDomainCantripProducer(
  rule: (typeof clericDomainCantrips)[number],
  target: string,
) {
  return selectedFeatureSpellAddress([
    target,
    'subclassFeature',
    norm(rule.name),
    rule.source,
    target.split('|').slice(1).join('|'),
    0,
    0,
  ])
}

const isClericDomainCantripAddress = (value: string, target: string) =>
  clericDomainCantrips.some(
    (rule) =>
      matchesClericCantripTarget(rule, target) &&
      getClericDomainCantripProducer(rule, target) === value,
  )

export function isClericDomainCantripSlot(slot: ManagedClassSpellSlot) {
  const [owner, domain, producer, gain, ordinal] = slot
  if (domain !== 'feature-cantrip' || owner[0] !== 'subclass' || owner[1] !== 'cleric') return false
  const address = decodeSelectedFeatureSpellAddress(producer)
  return (
    Number.isInteger(gain) &&
    gain >= 1 &&
    gain <= 20 &&
    Number.isInteger(ordinal) &&
    ordinal >= 0 &&
    ordinal < maximumDomainCantrips &&
    !!address &&
    clericDomainCantrips.some(
      (rule) =>
        owner[2] === rule.printing &&
        owner[3] === rule.subclass &&
        owner[4] === rule.source &&
        matchesClericCantripTarget(rule, address[0], gain) &&
        getClericDomainCantripProducer(rule, address[0]) === producer,
    )
  )
}

export const declaredSubclassSlots = [
  BARD_PRIMAL_LORE_SPELL_SLOT,
  LAND_BONUS_SPELL_SLOT,
  ...giantPowerSpellSlots,
  ...wizardIllusionCantripSlots.map(({ slot }) => slot),
]
export function getArcaneArcherCantripSlot(
  printing: string,
  source: string,
  level: number,
  originLevel: number,
) {
  const lore = getArcaneArcherLoreIdentity(printing, source, originLevel)
  if (
    !lore ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 20 ||
    (lore.origin === printing && level !== originLevel)
  )
    return undefined
  return [
    [...lore.owner],
    'feature-cantrip',
    selectedFeatureSpellAddress([
      lore.target,
      'subclassFeature',
      lore.name,
      source,
      lore.target,
      0,
      0,
    ]),
    level,
    0,
  ] satisfies ManagedClassSpellSlot
}

export function isArcaneArcherCantripSlot(slot: ManagedClassSpellSlot) {
  const [owner, domain, target, level] = slot
  if (owner[0] !== 'subclass' || owner[1] !== 'fighter' || domain !== 'feature-cantrip')
    return false
  const address = decodeSelectedFeatureSpellAddress(target)
  const originLevel = Number(address?.[0].split('|')[6])
  return (
    JSON.stringify(slot) ===
    JSON.stringify(getArcaneArcherCantripSlot(owner[2], owner[4], level, originLevel))
  )
}

export const isDeclaredSubclassCantripSlot = (slot: ManagedClassSpellSlot) =>
  isArcaneArcherCantripSlot(slot) ||
  isClericDomainCantripSlot(slot) ||
  declaredSubclassSlots.some((row) => JSON.stringify(slot) === JSON.stringify(row))

/** Structural saved intent only. Current source/selection, count and eligibility remain live. */
export function decodeSelectedFeatureSpellAddress(
  value: string,
): SelectedFeatureSpellAddress | undefined {
  if (!value.startsWith(prefix)) return undefined
  try {
    const parts = JSON.parse(value.slice(prefix.length))
    const order = Array.isArray(parts) ? getClassOrderById(parts[0]) : undefined
    const archer =
      Array.isArray(parts) &&
      typeof parts[0] === 'string' &&
      parts[2] === 'arcane archer lore' &&
      ['phb', 'xphb'].some((printing) => {
        const level = Number(parts[0].split('|')[6])
        return getArcaneArcherCantripSlot(printing, parts[3], level, level)?.[2] === value
      })
    if (
      !Array.isArray(parts) ||
      parts.length !== 7 ||
      typeof parts[0] !== 'string' ||
      !parts[0].trim() ||
      !['optionalFeature', 'feat', 'classFeature', 'subclassFeature'].includes(parts[1]) ||
      !normalized(parts[2]) ||
      !normalized(parts[3]) ||
      (parts[1] === 'classFeature'
        ? !order ||
          parts[2] !== norm(order.caster.name) ||
          parts[3] !== 'xphb' ||
          parts[4] !== order.caster.target
        : parts[1] === 'subclassFeature'
          ? !archer &&
            !isClericDomainCantripAddress(value, parts[0]) &&
            !declaredSubclassSlots.some((slot) => slot[2] === value)
          : parts[4] !== null) ||
      parts[5] !== 0 ||
      parts[6] !== 0 ||
      selectedFeatureSpellAddress(parts as SelectedFeatureSpellAddress) !== value
    )
      return undefined
    return parts as SelectedFeatureSpellAddress
  } catch {
    return undefined
  }
}

export function isSelectedFeatureSpellSlot(value: unknown): value is ManagedClassSpellSlot {
  if (!Array.isArray(value) || value.length !== 5) return false
  const [owner, domain, target, level, ordinal] = value
  const address = typeof target === 'string' ? decodeSelectedFeatureSpellAddress(target) : undefined
  return (
    Array.isArray(owner) &&
    ((owner.length === 3 && owner[0] === 'class') ||
      (owner.length === 5 && owner[0] === 'subclass')) &&
    owner.slice(1).every(normalized) &&
    !!address &&
    (domain === 'feature-cantrip' ||
      (domain === 'feature-prepared' &&
        isSelectedInvocationRitualSlot(value as ManagedClassSpellSlot))) &&
    (address[1] !== 'classFeature' ||
      (owner[0] === 'class' &&
        owner[1] === getClassOrderById(address[0])?.owner &&
        owner[2] === 'xphb' &&
        level === 1 &&
        ordinal === 0)) &&
    (address[1] !== 'subclassFeature' ||
      isDeclaredSubclassCantripSlot(value as ManagedClassSpellSlot)) &&
    Number.isSafeInteger(level) &&
    level >= 1 &&
    level <= 20 &&
    Number.isSafeInteger(ordinal) &&
    ordinal >= 0
  )
}

export function isSelectedInvocationRitualSlot(slot: ManagedClassSpellSlot) {
  const [owner, domain, producer, level, ordinal] = slot
  if (domain !== 'feature-prepared' || owner[0] !== 'class') return false
  const address = decodeSelectedFeatureSpellAddress(producer)
  return (
    !!address &&
    address[1] === 'optionalFeature' &&
    isRevisedInvocationPoolId(address[0]) &&
    address[0] === getRevisedInvocationPoolId({ name: owner[1], source: owner[2] }) &&
    Number.isInteger(level) &&
    level >= 1 &&
    level <= 20 &&
    Number.isInteger(ordinal) &&
    ordinal >= 0 &&
    ordinal < 2
  )
}
