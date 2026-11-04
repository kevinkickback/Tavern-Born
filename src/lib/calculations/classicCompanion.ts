import type { Creature5e } from '@/types/5etools'
import { formatModifier } from './abilityScores'

export function getNumericCreatureArmorClass(entry: unknown): number | undefined {
  const value = entry && typeof entry === 'object' && 'ac' in entry ? entry.ac : entry
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function numericBonus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^[+-]?\d+$/u.test(value.trim())) return Number(value)
  return undefined
}

function scaleProficiencies(values: Record<string, unknown> | undefined, proficiency: number) {
  return (
    values &&
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => {
        const base = numericBonus(value)
        return [name, base === undefined ? value : formatModifier(base + proficiency)]
      }),
    )
  )
}

function scaleRollText(value: string, proficiency: number): string {
  const hits = value.replace(
    /\{@hit ([+-]?\d+)\}/gu,
    (_, hit: string) => `{@hit ${Number(hit) + proficiency}}`,
  )
  let previousDamageEnd = 0
  return hits.replace(
    /(?:(\d+) \()?\{@damage (\d*d\d+)(?:\s*([+-])\s*(\d+))?\}(\))?/giu,
    (
      match,
      average: string | undefined,
      dice: string,
      sign: string | undefined,
      constant: string | undefined,
      close: string | undefined,
      offset: number,
    ) => {
      const preceding = hits.slice(previousDamageEnd, offset)
      const subsequent = previousDamageEnd !== 0
      previousDamageEnd = offset + match.length
      // Extra dice and damage types on the same hit share its one bonus. A separate
      // saving throw or alternative roll has its own. Fixed damage has no roll.
      if (
        /\bextra\s*$/iu.test(preceding) ||
        (subsequent && !/\b(?:saving throw|or)\b/iu.test(preceding))
      )
        return match
      const modifier = Number(constant ?? 0) * (sign === '-' ? -1 : 1) + proficiency
      const formula = modifier ? `${dice} ${modifier < 0 ? '-' : '+'} ${Math.abs(modifier)}` : dice
      const roll = `{@damage ${formula}}`
      if (average === undefined) return roll + (close ?? '')
      return close ? `${Number(average) + proficiency} (${roll})` : match
    },
  )
}

function scaleEntry(entry: unknown, proficiency: number): unknown {
  if (typeof entry === 'string') return scaleRollText(entry, proficiency)
  if (Array.isArray(entry)) return entry.map((row) => scaleEntry(row, proficiency))
  if (!entry || typeof entry !== 'object') return entry
  const row = entry as Record<string, unknown>
  return {
    ...row,
    ...('entries' in row && { entries: scaleEntry(row.entries, proficiency) }),
    ...('entry' in row && { entry: scaleEntry(row.entry, proficiency) }),
    ...('items' in row && { items: scaleEntry(row.items, proficiency) }),
  }
}

/** PHB Ranger's Companion adds the Ranger's bonuses to the published creature. */
export function scaleClassicCompanion(
  creature: Creature5e,
  rangerLevel: number,
  proficiency: number,
): Creature5e {
  const scaleEntries = (rows: Creature5e['action']) =>
    rows?.map((row) =>
      row.entries
        ? { ...row, entries: row.entries.map((entry) => scaleEntry(entry, proficiency)) }
        : row,
    )
  const normalHp = numericBonus(creature.hp?.average) ?? numericBonus(creature.hp?.special)
  const passive = numericBonus(creature.passive)
  return {
    ...creature,
    ac: creature.ac?.map((row) => {
      const base = getNumericCreatureArmorClass(row)
      if (base === undefined) return row
      return typeof row === 'number'
        ? base + proficiency
        : { ...(row as object), ac: base + proficiency }
    }),
    hp:
      normalHp === undefined
        ? creature.hp
        : { formula: creature.hp?.formula, average: Math.max(normalHp, 4 * rangerLevel) },
    save: scaleProficiencies(creature.save, proficiency),
    skill: scaleProficiencies(creature.skill, proficiency),
    passive:
      passive !== undefined && numericBonus(creature.skill?.perception) !== undefined
        ? passive + proficiency
        : creature.passive,
    trait: scaleEntries(creature.trait),
    action: scaleEntries(creature.action),
    bonus: scaleEntries(creature.bonus),
    reaction: scaleEntries(creature.reaction),
    legendary: scaleEntries(creature.legendary),
    mythic: scaleEntries(creature.mythic),
  }
}
