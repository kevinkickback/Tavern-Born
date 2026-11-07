import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getCurrentFighterSubclassSource } from './fighterSubclassSource'
import { FIGHTER_SUBCLASS_RESOURCE_FEATURES } from './nativeSubclassFeatureSource'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

const numberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const wordCount = (word: string) => numberWords.indexOf(word) + 1

const maxFromGain = (gain: number, max: number) =>
  Array.from({ length: 20 }, (_, index) => (index + 1 >= gain ? max : 0))

function prose(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    if (typeof entry === 'string')
      return [
        entry
          .replace(/\{@variantrule (Short Rest|Long Rest)\|XPHB(?:\|Short)?\}/g, (_, rest) =>
            rest.toLowerCase(),
          )
          .replace(/short rest or long rest/g, 'short or long rest'),
      ]
    const section = record(entry)
    return section.type === 'entries' && Array.isArray(section.entries)
      ? prose(section.entries)
      : []
  })
}

function readDiceRows(entries: readonly unknown[], gain: number) {
  const tables = entries.map(record).filter((entry) => entry.caption === 'Psi Warrior Energy Dice')
  const [table] = tables
  if (
    tables.length !== 1 ||
    table.type !== 'table' ||
    JSON.stringify(table.colLabels) !== '["Fighter Level","Die Size","Number"]' ||
    !Array.isArray(table.rows) ||
    !table.rows.length
  )
    return undefined
  const counts = new Map<number, number>()
  let previous = gain - 1
  for (const row of table.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 3 ||
      typeof row[0] !== 'string' ||
      !/^(?:[1-9]|1[0-9]|20)$/.test(row[0]) ||
      typeof row[1] !== 'string' ||
      !/^\{@dice d\d+\}$/i.test(row[1]) ||
      typeof row[2] !== 'string' ||
      !/^[1-9]\d?$/.test(row[2]) ||
      Number(row[0]) <= previous
    )
      return undefined
    previous = Number(row[0])
    counts.set(previous, Number(row[2]))
  }
  if (!counts.has(gain)) return undefined
  let max = 0
  return Array.from({ length: 20 }, (_, index) => {
    max = counts.get(index + 1) ?? max
    return max
  })
}

function readResource(
  name: string,
  source: string,
  level: number,
  entries: readonly unknown[],
  modifiers: AbilityScores | undefined,
  proficiencyBonus: number,
): Omit<ClassResourceDef, 'id'> | undefined {
  const text = prose(entries).join(' ')
  if (name === 'Psionic Power') {
    if (source === 'XPHB') {
      const maxPerLevel = readDiceRows(entries, level)
      return maxPerLevel &&
        text.includes(
          'You regain one of your expended Psionic Energy Dice when you finish a short rest, and you regain all of them when you finish a long rest.',
        )
        ? {
            label: 'Psionic Energy Dice',
            maxPerLevel,
            restType: 'short',
            recovery: { shortRest: 1, longRest: 'all' },
          }
        : undefined
    }
    const multiple =
      /You have a number of these dice equal to (twice|three times) your proficiency bonus,/.exec(
        text,
      )
    if (
      !multiple ||
      !text.includes(
        'You regain all your expended Psionic Energy dice when you finish a long rest.',
      ) ||
      !text.includes(
        "as a bonus action, you can regain one expended Psionic Energy die, but you can't do so again until you finish a short or long rest.",
      )
    )
      return undefined
    const maxPerLevel = maxFromGain(level, (multiple[1] === 'twice' ? 2 : 3) * proficiencyBonus)
    return {
      label: 'Psionic Energy Dice',
      maxPerLevel,
      restType: 'long',
      usageText: 'As a Bonus Action, regain one expended die once per Short or Long Rest.',
    }
  }
  const ability =
    /a number of times equal to your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier \((?:a )?minimum of (once|twice)\)(?:, and you regain|\. You regain) all expended uses(?: of it)? when you finish a (short or long|long) rest\./.exec(
      text,
    )
  const fixed =
    /(?:You can use this feature (\w+) times?|You have (\w+) uses of this ability), and you regain all expended uses of it when you finish a (short or long|long) rest\./.exec(
      text,
    )
  const proficiency =
    /You can use this feature a number of times equal to your proficiency bonus, and you regain all expended uses(?: of it)? when you finish a (short or long|long) rest\./.exec(
      text,
    )
  const single =
    /Once you use this ability, you can't use it again until you finish a (short or long|long) rest\./.exec(
      text,
    )
  const count = ability
    ? Math.max(
        ability[2] === 'once' ? 1 : 2,
        modifiers?.[ability[1].toLowerCase() as keyof AbilityScores] ?? 0,
      )
    : fixed
      ? wordCount(fixed[1] ?? fixed[2])
      : proficiency
        ? proficiencyBonus
        : single
          ? 1
          : 0
  if (!count) return undefined
  const rest = ability?.[3] ?? fixed?.[3] ?? proficiency?.[1] ?? single?.[1]
  return {
    label: name,
    maxPerLevel: maxFromGain(level, count),
    restType: rest === 'short or long' ? 'short' : 'long',
  }
}

export function getFighterSubclassResources(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
  modifiers: AbilityScores | undefined,
  proficiencyBonus: number,
): ClassResourceDef[] {
  const current = getCurrentFighterSubclassSource(character, entry, classes)
  if (!current) return []
  const { subclass, getFeature } = current
  return (FIGHTER_SUBCLASS_RESOURCE_FEATURES.get(subclass.source) ?? []).flatMap((name) => {
    const feature = getFeature(name)
    if (!feature) return []
    const def = readResource(
      name,
      subclass.source,
      feature.level,
      feature.entries,
      modifiers,
      proficiencyBonus,
    )
    return def
      ? [
          {
            ...def,
            id:
              'fighter-' +
              norm(subclass.source) +
              '-' +
              name.toLowerCase().replace(/[^a-z]+/g, '-'),
          },
        ]
      : []
  })
}
