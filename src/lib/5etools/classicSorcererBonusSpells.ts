import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'
import { getNativeSubclassIntroFeature } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import { parseSpellToken } from './spellTokens'

const domain = 'subclass-spell-replacement'
const ruleFor = (subclass: string) => rules.find((row) => row.subclass === subclass)
const rules = [
  {
    subclass: 'aberrant mind',
    name: 'Psionic Spells',
    schools: ['D', 'E'],
    originals: [
      'arms of hadar|phb',
      'dissonant whispers|phb',
      'calm emotions|phb',
      'detect thoughts|phb',
      'hunger of hadar|phb',
      'sending|phb',
      "evard's black tentacles|phb",
      'summon aberration|tce',
      "rary's telepathic bond|phb",
      'telekinesis|phb',
    ],
  },
  {
    subclass: 'clockwork soul',
    name: 'Clockwork Magic',
    schools: ['A', 'T'],
    originals: [
      'alarm|phb',
      'protection from evil and good|phb',
      'aid|phb',
      'lesser restoration|phb',
      'dispel magic|phb',
      'protection from energy|phb',
      'freedom of movement|phb',
      'summon construct|tce',
      'greater restoration|phb',
      'wall of force|phb',
    ],
  },
]

const rankOf = (ordinal: number) => Math.floor(ordinal / 2) + 1
const gainOf = (ordinal: number) => 2 * rankOf(ordinal) - 1
const targetOf = (rule: (typeof rules)[number]) =>
  `subclass-feature|${norm(rule.name)}|sorcerer|phb|${rule.subclass}|tce|1|tce`

export function getClassicSorcererReplacementRule(slot: ManagedClassSpellSlot) {
  if (!Array.isArray(slot) || slot.length !== 5) return undefined
  const [owner, kind, target, level, ordinal] = slot
  if (
    !Array.isArray(owner) ||
    owner.length !== 5 ||
    owner[0] !== 'subclass' ||
    owner[1] !== 'sorcerer' ||
    owner[2] !== 'phb' ||
    owner[4] !== 'tce' ||
    kind !== domain ||
    !Number.isInteger(level) ||
    level < 2 ||
    level > 20 ||
    !Number.isInteger(ordinal) ||
    ordinal < 0 ||
    ordinal >= 10 ||
    gainOf(ordinal) > level
  )
    return undefined
  const rule = ruleFor(owner[3])
  return rule && targetOf(rule) === target
    ? { ...rule, original: rule.originals[ordinal], rank: rankOf(ordinal) }
    : undefined
}

export function getClassicSorcererReplacementSlots(
  entry: CharacterClassEntry,
): ManagedClassSpellSlot[] {
  if (
    norm(entry.name) !== 'sorcerer' ||
    norm(entry.source) !== 'phb' ||
    norm(entry.subclassSource) !== 'tce'
  )
    return []
  const rule = ruleFor(norm(entry.subclass))
  if (!rule) return []
  const owner: ClassSpellOwner = ['subclass', 'sorcerer', 'phb', rule.subclass, 'tce']
  return Array.from(
    { length: Math.max(0, Math.min(20, entry.levels) - 1) },
    (_, index) => index + 2,
  ).flatMap((level) =>
    rule.originals.flatMap((_, ordinal): ManagedClassSpellSlot[] =>
      gainOf(ordinal) <= level ? [[owner, domain, targetOf(rule), level, ordinal]] : [],
    ),
  )
}

export function getClassicSorcererBonusSpellSource(cls: Class5e, subclass: Subclass5e) {
  const rule = ruleFor(norm(subclass.name))
  if (
    !rule ||
    cls.name !== 'Sorcerer' ||
    cls.source !== 'PHB' ||
    subclass.classSource !== cls.source ||
    subclass.source !== 'TCE' ||
    norm(subclass.shortName) !== rule.subclass ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    !matchesNativeSubclassGain(cls, 'class-feature|sorcerous origin|sorcerer|phb|1|phb', 1)
  )
    return undefined
  const feature = getNativeSubclassIntroFeature(cls, subclass, 1, rule.name)
  if (feature?.target !== targetOf(rule)) return undefined
  const clause = (feature.entries ?? []).filter(
    (line): line is string =>
      typeof line === 'string' &&
      line.startsWith(
        'Whenever you gain a sorcerer level, you can replace one spell you gained from this feature with another spell of the same level.',
      ),
  )
  const schedule =
    subclass.additionalSpells?.length === 1 ? subclass.additionalSpells[0].known : undefined
  if (
    clause.length !== 1 ||
    !clause[0].includes(
      `|spells|class=sorcerer;warlock;wizard|school=${rule.schools.join(';')}|level=1;2;3;4;5}`,
    )
  )
    return undefined
  return rule.originals.every((reference, ordinal) =>
    schedule?.[gainOf(ordinal)]?.some(
      (token) => getSpellReferenceKey(parseSpellToken(token).name) === reference,
    ),
  )
    ? rule
    : undefined
}
