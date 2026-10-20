import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import generated from './classCastingRuntime.generated'
import type { CastingProducerRule } from './classCastingStructure'

/** Pure finite authority for saved identities; current rules must still prove live entitlement. */
export const CLASS_CASTING_PRODUCERS =
  generated.producers as unknown as readonly CastingProducerRule[]

// These exact full-list preparation producers differ from level-earned lists and Wizard learning.
export const DAILY_CLASS_CASTING_OWNERS = [
  ['class', 'artificer', 'tce'],
  ['class', 'artificer', 'efa'],
  ['class', 'cleric', 'phb'],
  ['class', 'cleric', 'xphb'],
  ['class', 'druid', 'phb'],
  ['class', 'druid', 'xphb'],
  ['class', 'paladin', 'phb'],
  ['class', 'paladin', 'xphb'],
  ['class', 'ranger', 'xphb'],
] as const

const norm = (value?: string) => value?.trim().toLowerCase() ?? ''
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const ordinary = CLASS_CASTING_PRODUCERS.filter((row) => !row.domains['class-arcanum'])

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
  if (!['class-cantrip', 'class-known', 'class-spellbook'].includes(domain)) return undefined
  const rule = ordinary.find(
    (row) => same(row.declaration.owner, owner) && row.declaration.target === target,
  )
  const gain = rule?.domains[domain]?.find((row) => row.level === level)
  return rule && gain && Number.isInteger(ordinal) && ordinal >= 0 && ordinal < gain.count
    ? { rule, gain }
    : undefined
}

export function getClassSpellProfilePolicy(entry: CharacterClassEntry) {
  const parent = ['class', norm(entry.name), norm(entry.source)]
  const child = entry.subclass
    ? ['subclass', parent[1], parent[2], norm(entry.subclass), norm(entry.subclassSource)]
    : undefined
  const rule =
    (child && ordinary.find((row) => same(row.declaration.owner, child))) ||
    ordinary.find((row) => same(row.declaration.owner, parent))
  const mode = rule?.domains['class-spellbook']
    ? 'spellbook'
    : rule?.domains['class-known']
      ? 'known'
      : DAILY_CLASS_CASTING_OWNERS.some((owner) => same(owner, parent))
        ? 'daily'
        : 'none'
  return { rule, mode } as const
}
