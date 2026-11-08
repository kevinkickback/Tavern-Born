import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import { getCurrentDirectSubclassSource } from './directSubclassSource'
import { ARCANE_DABBLER, getArcaneDabblerTarget } from './mysticFeatureIdentity'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { parseFeatSpellFilter } from './parsers/featOptions'
import { PSIONIC_CLASS_SOURCE } from './psionicIdentity'

const source = norm(PSIONIC_CLASS_SOURCE)
const owner: ClassSpellOwner = ['subclass', 'mystic', source, 'order of the wu jen', source]
const quantities = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export const isArcaneDabblerOwner = (entry: CharacterClassEntry) =>
  norm(entry.name) === owner[1] &&
  norm(entry.source) === owner[2] &&
  norm(entry.subclass) === owner[3] &&
  norm(entry.subclassSource) === owner[4]

export function isArcaneDabblerSlot(slot: ManagedClassSpellSlot) {
  if (!Array.isArray(slot) || slot.length !== 5) return false
  const [slotOwner, domain, target, level, ordinal] = slot
  return (
    domain === 'feature-prepared' &&
    JSON.stringify(slotOwner) === JSON.stringify(owner) &&
    Number.isInteger(level) &&
    level > 0 &&
    level <= 20 &&
    target === getArcaneDabblerTarget(level) &&
    Number.isInteger(ordinal) &&
    ordinal >= 0 &&
    ordinal < quantities.length
  )
}

function readDabblerFilter(text: string) {
  if (!/^level=[1-9](?:;[1-9])*\|class=[a-z]+(?:;[a-z]+)*$/i.test(text)) return undefined
  const parsed = parseFeatSpellFilter(text.toLowerCase())
  const ranks = [...new Set(parsed.level)].sort((a, b) => a - b)
  const classes = [...new Set(parsed.className?.split(';'))].sort()
  return ranks.length && classes.length && ranks.length === parsed.level?.length
    ? { ranks, classes }
    : undefined
}

export function getArcaneDabbler(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
) {
  if (!isArcaneDabblerOwner(entry)) return undefined
  const current = getCurrentDirectSubclassSource(character, entry, classes, 'Mystic')
  const feature = current?.getFeature(ARCANE_DABBLER)
  if (
    !feature ||
    feature.target !== getArcaneDabblerTarget(feature.level) ||
    feature.entries.length !== 5
  )
    return undefined
  const [opening, slotCreation, rawTable, limit, replacement] = feature.entries
  const match =
    typeof opening === 'string' &&
    /^At (\d+)(?:st|nd|rd|th) level, you learn (\w+) ([a-z]+) spells of your choice and always have them prepared\. The spells must be of \{@filter [^{}|]+\|spells\|([^{}]+)\}\.$/i.exec(
      opening,
    )
  const swap =
    typeof replacement === 'string' &&
    /^Whenever you gain a level in this class, you can replace one of the chosen ([a-z]+) spells with a different \{@filter [^{}|]+\|spells\|([^{}]+)\}\.$/i.exec(
      replacement,
    )
  if (
    !match ||
    !swap ||
    Number(match[1]) !== feature.level ||
    slotCreation !==
      'As a bonus action, you can spend psi points to create spell slots that you can use to cast these spells, as well as other spells you are capable of casting. The psi-point cost of each spell slot is detailed on the table below.' ||
    limit !==
      'The spell slot remains until you use it or finish a long rest. You must observe your psi limit when spending psi points to create a spell slot.'
  )
    return undefined
  const count = quantities.indexOf(match[2]) + 1
  const filter = readDabblerFilter(match[4])
  if (
    !count ||
    filter?.classes.length !== 1 ||
    filter.classes[0] !== norm(match[3]) ||
    filter.classes[0] !== norm(swap[1]) ||
    JSON.stringify(filter) !== JSON.stringify(readDabblerFilter(swap[2]))
  )
    return undefined
  const table = record(rawTable)
  if (
    table.type !== 'table' ||
    JSON.stringify(table.colLabels) !== '["Spell Slot Level","Psi Cost"]' ||
    !Array.isArray(table.rows) ||
    !table.rows.length
  )
    return undefined
  const costs = table.rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length !== 2) return []
    const rank = typeof row[0] === 'string' && /^([1-9])(?:st|nd|rd|th)$/.exec(row[0])
    const cost = typeof row[1] === 'string' && /^[1-9]\d*$/.test(row[1]) ? Number(row[1]) : 0
    return rank && Number.isSafeInteger(cost) && cost > 0 ? [{ rank: Number(rank[1]), cost }] : []
  })
  if (
    costs.length !== table.rows.length ||
    costs.some(({ rank }, index) => rank !== index + 1) ||
    filter.ranks.some((rank) => !costs.some((row) => row.rank === rank))
  )
    return undefined
  return { ...filter, count, costs, level: feature.level, target: feature.target }
}

export function getArcaneDabblerSlots(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
): ManagedClassSpellSlot[] {
  const rule = getArcaneDabbler(character, entry, classes)
  return rule
    ? Array.from({ length: rule.count }, (_, ordinal) => [
        owner,
        'feature-prepared',
        rule.target,
        rule.level,
        ordinal,
      ])
    : []
}
