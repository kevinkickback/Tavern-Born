import type { CharacterClassEntry } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import { getBardLoreSpellRule } from './bardSpellSources'
import copyOwners from './classCastingCopyOwners.generated'
import generated from './classCastingRuntime.generated'
import type { CastingProducerRule } from './classCastingStructure'
import { getClericArcanaSpellRule } from './clericArcanaSpells'
import { isArcaneDabblerSlot } from './mysticArcaneDabbler'
import { getSavantSpellbookGain } from './savantSpellbookRules'
import { isSelectedFeatureSpellSlot } from './selectedFeatureSpellIdentity'
import { getSpellbookSpecialtyRule } from './spellbookSpecialtyRules'

/** Pure finite authority for saved identities; current rules must still prove live entitlement. */
export const CLASS_CASTING_PRODUCERS =
  generated.producers as unknown as readonly CastingProducerRule[]

const norm = (value?: string) => value?.trim().toLowerCase() ?? ''
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const ordinary = CLASS_CASTING_PRODUCERS.filter((row) => !row.domains['class-arcanum'])
const copyParents = new Map(
  copyOwners.map(([owner, parent]) => [JSON.stringify(owner), parent as ClassSpellOwner]),
)

/** Structural admission only. Current casting still needs live copy and feature evidence. */
export const getClassCastingCopyParent = (owner: ClassSpellOwner) =>
  copyParents.get(JSON.stringify(owner))

export function getClassCastingProducersForOwner(owner: ClassSpellOwner) {
  const parent = getClassCastingCopyParent(owner) ?? owner
  return CLASS_CASTING_PRODUCERS.filter((row) => same(row.declaration.owner, parent))
}

// Pinned 5etools class filters collapse the two standard class printings into one filter item.
// These exact certified targets therefore declare finite alternatives, not a guessed source default.
export const DECLARED_CASTING_LISTS: Readonly<
  Record<string, readonly (readonly [string, string])[]>
> = {
  'subclass-feature|spellcasting|fighter|phb|eldritch knight|phb|3|phb': [
    ['wizard', 'phb'],
    ['wizard', 'xphb'],
  ],
  'subclass-feature|spellcasting|fighter|xphb|eldritch knight|xphb|3|xphb': [
    ['wizard', 'phb'],
    ['wizard', 'xphb'],
  ],
  'subclass-feature|spellcasting|rogue|phb|arcane trickster|phb|3|phb': [
    ['wizard', 'phb'],
    ['wizard', 'xphb'],
  ],
  'subclass-feature|spellcasting|rogue|xphb|arcane trickster|xphb|3|xphb': [
    ['wizard', 'phb'],
    ['wizard', 'xphb'],
  ],
  'subclass-feature|spellcasting|monk|xphb|mystic arts|au|3|au': [
    ['sorcerer', 'phb'],
    ['sorcerer', 'xphb'],
  ],
}

export function getManagedClassSpellRule(slot: ManagedClassSpellSlot) {
  if (!Array.isArray(slot) || slot.length !== 5) return undefined
  const [owner, domain, target, level, ordinal] = slot
  if (
    domain === 'feature-cantrip' ||
    domain === 'feature-prepared' ||
    domain === 'class-spellbook-specialty'
  )
    return undefined
  if (!['class-cantrip', 'class-known', 'class-spellbook', 'class-arcanum'].includes(domain))
    return undefined
  const rule = getClassCastingProducersForOwner(owner).find(
    (row) => row.declaration.target === target,
  )
  const gain = rule?.domains[domain]?.find((row) => row.level === level)
  return rule && gain && Number.isInteger(ordinal) && ordinal >= 0 && ordinal < gain.count
    ? { rule, gain }
    : undefined
}

/** Admission checks the feature protocol structurally; it never grants current authority. */
export const isManagedClassSpellSlot = (slot: ManagedClassSpellSlot) =>
  !!getManagedClassSpellRule(slot) ||
  !!getBardLoreSpellRule(slot) ||
  !!getClericArcanaSpellRule(slot) ||
  isArcaneDabblerSlot(slot) ||
  !!getSavantSpellbookGain(slot) ||
  isSelectedFeatureSpellSlot(slot) ||
  !!getSpellbookSpecialtyRule(slot)

export function getClassSpellProfilePolicy(entry: CharacterClassEntry) {
  const parent: ClassSpellOwner = ['class', norm(entry.name), norm(entry.source)]
  const child = entry.subclass
    ? ([
        'subclass',
        parent[1],
        parent[2],
        norm(entry.subclass),
        norm(entry.subclassSource),
      ] as const)
    : undefined
  const rule =
    (child && ordinary.find((row) => same(row.declaration.owner, child))) ||
    ordinary.find((row) => same(row.declaration.owner, getClassCastingCopyParent(parent) ?? parent))
  const mode = rule?.domains['class-spellbook']
    ? 'spellbook'
    : rule?.domains['class-known']
      ? 'known'
      : rule?.preparation?.mode === 'daily'
        ? 'daily'
        : 'none'
  return {
    rule,
    mode,
    owner: rule?.declaration.owner[0] === 'subclass' ? rule.declaration.owner : parent,
  } as const
}
