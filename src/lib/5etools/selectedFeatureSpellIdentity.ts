import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { BARD_PRIMAL_LORE_TARGET } from './bardCollegeFeatures'
import { LAND_BONUS_REF, LAND_BONUS_TARGET } from './circleOfTheLand'
import { getClassOrderById } from './classOrderIdentity'
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
export const declaredSubclassSlots = [
  BARD_PRIMAL_LORE_SPELL_SLOT,
  LAND_BONUS_SPELL_SLOT,
  ...wizardIllusionCantripSlots.map(({ slot }) => slot),
]

/** Structural saved intent only. Current source/selection, count and eligibility remain live. */
export function decodeSelectedFeatureSpellAddress(
  value: string,
): SelectedFeatureSpellAddress | undefined {
  if (!value.startsWith(prefix)) return undefined
  try {
    const parts = JSON.parse(value.slice(prefix.length))
    const order = Array.isArray(parts) ? getClassOrderById(parts[0]) : undefined
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
          ? !declaredSubclassSlots.some((slot) => slot[2] === value)
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
    domain === 'feature-cantrip' &&
    !!address &&
    (address[1] !== 'classFeature' ||
      (owner[0] === 'class' &&
        owner[1] === getClassOrderById(address[0])?.owner &&
        owner[2] === 'xphb' &&
        level === 1 &&
        ordinal === 0)) &&
    (address[1] !== 'subclassFeature' ||
      declaredSubclassSlots.some((slot) => JSON.stringify(value) === JSON.stringify(slot))) &&
    Number.isSafeInteger(level) &&
    level >= 1 &&
    level <= 20 &&
    Number.isSafeInteger(ordinal) &&
    ordinal >= 0
  )
}
