import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { getCurrentSelectedClass, getEarnedDirectClassFeature } from './earnedClassFeatureSource'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'

export function getCurrentMonkBaseRules(
  character: Character,
  catalogs: (ClassFeatureSourceCatalog & { classes?: readonly Class5e[] }) | undefined,
) {
  const owners = character.classProgression.filter(
    (row) => row.name.trim().toLowerCase() === 'monk',
  )
  const owner = owners[0]
  if (
    !catalogs ||
    owners.length !== 1 ||
    !getSourceCompatibility(owner.source, character.originSystem).compatible
  )
    return undefined
  const parents = catalogs.classes?.filter((row) => findClassReference(owner, [row]))
  const cls = parents?.[0]
  if (parents?.length !== 1 || !cls || !['PHB', 'XPHB'].includes(cls.source)) return undefined
  return {
    owner,
    cls,
    getFeature(name: string) {
      const refs = cls.classFeatureRefs?.filter(
        (row) => row.name === name && row.source === cls.source,
      )
      const ref = refs?.[0]
      const level = ref?.level
      const target = ref && getClassFeatureIdentity(ref)
      if (
        refs?.length !== 1 ||
        !target ||
        !level ||
        level > owner.levels ||
        !ref.feature?.entries?.length
      )
        return undefined
      const entries = JSON.stringify(ref.feature.entries)
      const feature = getCurrentDirectClassFeature(
        cls,
        catalogs,
        target,
        (row) => !('_copy' in row) && JSON.stringify(row.entries) === entries,
      )
      return feature && { feature, target, level }
    },
  }
}

/** Equivalent inherited monk rules keep their source vocabulary and use the actor's table. */
export function getInheritedMonkBaseRules(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: Parameters<typeof getCurrentMonkBaseRules>[1],
) {
  if (findClassReference({ name: 'Monk', source: 'XPHB' }, [entry])) return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  if (!cls) return undefined
  return {
    owner: entry,
    cls,
    getFeature(name: string) {
      const level = name === 'Unarmored Defense' ? 1 : name === 'Unarmored Movement' ? 2 : undefined
      if (!level) return undefined
      const target = `class-feature|${name.toLowerCase()}|monk|xphb|${level}|xphb`
      const current = getEarnedDirectClassFeature(character, entry, catalogs, target)
      return current && { feature: current.feature, target, level }
    },
  }
}

type MonkBaseRules = ReturnType<typeof getCurrentMonkBaseRules>

export function getMonkAbilityIncrease(monk: MonkBaseRules) {
  const row = monk?.getFeature('Body and Mind')
  const text = row?.feature.entries?.[0]
  const match =
    monk?.cls.source === 'XPHB' &&
    typeof text === 'string' &&
    /Your (\w+) and (\w+) scores increase by ([1-9]\d*), to a maximum of ([1-9]\d*)\.$/.exec(text)
  if (!match) return undefined
  const first = toAbilityName(match[1])
  const second = toAbilityName(match[2])
  return first && second && first !== second
    ? { abilities: [first, second], amount: Number(match[3]), maximum: Number(match[4]) }
    : undefined
}

export function getMonkUnarmoredDefense(monk: MonkBaseRules) {
  const row = monk?.getFeature('Unarmored Defense')
  const text = row?.feature.entries?.[0]
  if (!row || typeof text !== 'string') return undefined
  const match =
    row.feature.classSource === 'PHB'
      ? /^Beginning at (\d+)(?:st|nd|rd|th) level, while you are wearing no armor and not wielding a shield, your AC equals ([1-9]\d*) \+ your (\w+) modifier \+ your (\w+) modifier\.$/.exec(
          text,
        )
      : /^While you aren't wearing armor or wielding a \{@item Shield\|XPHB\}, your base \{@variantrule Armor Class\|XPHB\} equals ([1-9]\d*) plus your (\w+) and (\w+) modifiers\.$/.exec(
          text,
        )
  if (!match || (row.feature.classSource === 'PHB' && Number(match[1]) !== row.level))
    return undefined
  const [base, first, second] = match.slice(-3)
  const firstAbility = toAbilityName(first)
  const secondAbility = toAbilityName(second)
  return firstAbility && secondAbility && firstAbility !== secondAbility
    ? { ...row, base: Number(base), firstAbility, secondAbility }
    : undefined
}

export function getMonkUnarmoredMovement(monk: MonkBaseRules) {
  const row = monk?.getFeature('Unarmored Movement')
  const text = row?.feature.entries?.[0]
  if (
    !monk ||
    !row ||
    typeof text !== 'string' ||
    !/your speed increases by [1-9]\d* feet while you (?:are not wearing armor or wielding a shield|aren't wearing armor or wielding a \{@item Shield\|XPHB\})\./i.test(
      text,
    )
  )
    return undefined
  const columns = (monk.cls.classTableGroups ?? [])
    .map(record)
    .flatMap(({ colLabels, rows }) =>
      Array.isArray(colLabels) && Array.isArray(rows)
        ? colLabels.flatMap((label, index) => (label === row.feature.name ? [{ rows, index }] : []))
        : [],
    )
  if (columns.length !== 1) return undefined
  const [{ rows, index }] = columns
  const value = record(rows[monk.owner.levels - 1]?.[index])
  const declared = /speed increases by ([1-9]\d*) feet/i.exec(text)?.[1]
  const initial = record(rows[row.level - 1]?.[index])
  return initial.type === 'bonusSpeed' &&
    initial.value === Number(declared) &&
    value.type === 'bonusSpeed' &&
    typeof value.value === 'number' &&
    Number.isSafeInteger(value.value) &&
    value.value > 0
    ? { ...row, bonus: value.value }
    : undefined
}

export function getEmptyBodySpell(monk: MonkBaseRules) {
  const row = monk?.getFeature('Empty Body')
  const clauses = row?.feature.entries?.flatMap((entry) => {
    const match =
      typeof entry === 'string' &&
      /^Additionally, you can spend ([1-9]\d*) ki points to cast the \{@spell ([^{}]+)\} spell, without needing material components\. When you do so, you can't take any other creatures with you\.$/.exec(
        entry,
      )
    return match ? [match] : []
  })
  if (monk?.cls.source !== 'PHB' || !row || clauses?.length !== 1) return undefined
  const [, cost, token] = clauses[0]
  const spell = parseSpellToken(token)
  if (!spell.name || spell.isCantrip) return undefined
  return {
    target: row.target,
    level: row.level,
    featureName: row.feature.name,
    reference: spell.name,
    castOnly: { ignoresMaterial: true as const },
    castingNote: `${row.feature.name}: Spend ${cost} Ki to cast without a spell slot or material components. You cannot take other creatures with you.`,
  }
}

export function getMonkBaseResources(monk: MonkBaseRules): ClassResourceDef[] {
  const row = monk?.getFeature('Uncanny Metabolism')
  if (
    !row ||
    monk?.cls.source !== 'XPHB' ||
    !row.feature.entries?.includes(
      "Once you use this feature, you can't use it again until you finish a {@variantrule Long Rest|XPHB}.",
    )
  )
    return []
  return [
    {
      id: 'monk-xphb-uncanny-metabolism',
      label: row.feature.name,
      maxPerLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= row.level)),
      restType: 'long',
    },
  ]
}
