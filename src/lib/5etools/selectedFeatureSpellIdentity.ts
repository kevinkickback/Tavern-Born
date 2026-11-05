import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { LAND_BONUS_REF, LAND_BONUS_TARGET } from './circleOfTheLand'
import { DIVINE_ORDER_ID, DIVINE_ORDER_OPTIONS } from './divineOrderIdentity'

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

export const LAND_BONUS_SPELL_ADDRESS = selectedFeatureSpellAddress([
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

/** Structural saved intent only. Current source/selection, count and eligibility remain live. */
export function decodeSelectedFeatureSpellAddress(
  value: string,
): SelectedFeatureSpellAddress | undefined {
  if (!value.startsWith(prefix)) return undefined
  try {
    const parts = JSON.parse(value.slice(prefix.length))
    if (
      !Array.isArray(parts) ||
      parts.length !== 7 ||
      typeof parts[0] !== 'string' ||
      !parts[0].trim() ||
      !['optionalFeature', 'feat', 'classFeature', 'subclassFeature'].includes(parts[1]) ||
      !normalized(parts[2]) ||
      !normalized(parts[3]) ||
      (parts[1] === 'classFeature'
        ? parts[0] !== DIVINE_ORDER_ID ||
          parts[2] !== 'thaumaturge' ||
          parts[3] !== 'xphb' ||
          parts[4] !== DIVINE_ORDER_OPTIONS.thaumaturge
        : parts[1] === 'subclassFeature'
          ? value !== LAND_BONUS_SPELL_ADDRESS
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
        owner[1] === 'cleric' &&
        owner[2] === 'xphb' &&
        level === 1 &&
        ordinal === 0)) &&
    (address[1] !== 'subclassFeature' ||
      JSON.stringify(value) === JSON.stringify(LAND_BONUS_SPELL_SLOT)) &&
    Number.isSafeInteger(level) &&
    level >= 1 &&
    level <= 20 &&
    Number.isSafeInteger(ordinal) &&
    ordinal >= 0
  )
}
