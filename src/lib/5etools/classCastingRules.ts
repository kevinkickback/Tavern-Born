import type { CharacterClassEntry } from '@/types/character'
import type {
  ClassCastingSourceProof,
  ClassSpellOwner,
  ManagedClassSpellSlot,
} from '@/types/classCasting'
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

const isPlainOwner = (owner: ClassSpellOwner) =>
  owner[0] === 'class' &&
  owner.length === 3 &&
  owner
    .slice(1)
    .every(
      (part) =>
        typeof part === 'string' &&
        part.length > 0 &&
        part === norm(part) &&
        !/[|#{}]/u.test(part) &&
        Array.from(part).every((character) => character.charCodeAt(0) >= 32),
    )

/** Native class and subclass casting registrations reserve their exact parent printing. */
export function isCatalogCastingCopyOwner(owner: ClassSpellOwner) {
  return (
    isPlainOwner(owner) &&
    !CLASS_CASTING_PRODUCERS.some(
      ({ declaration }) => declaration.owner[1] === owner[1] && declaration.owner[2] === owner[2],
    )
  )
}

/** Historic owner pairs recover existing intent offline. Live copies come from the loaded catalog. */
export function getClassCastingCopyParent(
  owner: ClassSpellOwner,
  sources?: readonly ClassCastingSourceProof[],
) {
  const target = JSON.stringify(owner)
  if (!sources) return copyParents.get(target)
  if (!isCatalogCastingCopyOwner(owner)) return undefined
  const rows = sources.filter((row) => row.kind === 'casting-copy' && row.target === target)
  if (rows.length !== 1 || rows[0].verified !== true) return undefined
  const parent = CLASS_CASTING_PRODUCERS.find(
    ({ declaration }) =>
      declaration.owner[0] === 'class' && JSON.stringify(declaration.owner) === rows[0].certificate,
  )?.declaration.owner
  return parent && !same(owner, parent) ? parent : undefined
}

export function getClassCastingProducersForOwner(
  owner: ClassSpellOwner,
  sources?: readonly ClassCastingSourceProof[],
) {
  const parent = getClassCastingCopyParent(owner, sources) ?? owner
  const copiedTargets =
    sources && parent !== owner
      ? (sources.find((row) => row.kind === 'casting-copy' && row.target === JSON.stringify(owner))
          ?.copyTargets ?? [])
      : undefined
  return CLASS_CASTING_PRODUCERS.filter(
    (row) =>
      same(row.declaration.owner, parent) &&
      (!copiedTargets || copiedTargets.includes(row.declaration.target)),
  )
}

/** A source-free saved address can retain intent but cannot authorize a new pick. */
function getRetainedClassCastingRule(owner: ClassSpellOwner, target: string) {
  const registered = CLASS_CASTING_PRODUCERS.filter((row) => same(row.declaration.owner, owner))
  return (
    registered.length || !isCatalogCastingCopyOwner(owner)
      ? registered
      : CLASS_CASTING_PRODUCERS.filter((row) => row.declaration.owner[0] === 'class')
  ).find((row) => row.declaration.target === target)
}

export function isCatalogDerivedClassSpellSlot(slot: ManagedClassSpellSlot) {
  return (
    !getClassCastingProducersForOwner(slot[0]).some((row) => row.declaration.target === slot[2]) &&
    !!getManagedClassSpellRule(slot)
  )
}

export function isSavedDailyCastingTarget(entry: CharacterClassEntry, target: string) {
  return (
    getRetainedClassCastingRule(['class', norm(entry.name), norm(entry.source)], target)
      ?.preparation?.mode === 'daily'
  )
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
  const rule = getRetainedClassCastingRule(owner, target)
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

export function getClassSpellProfilePolicy(
  entry: CharacterClassEntry,
  sources?: readonly ClassCastingSourceProof[],
) {
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
    getClassCastingProducersForOwner(parent, sources).find((row) => !row.domains['class-arcanum'])
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
