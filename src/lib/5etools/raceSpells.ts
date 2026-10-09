import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { RaceAdditionalSpells, RaceSpellItem, RaceSpellSchedule } from '@/types/5etools'
import { getRaceSpellChoiceKey } from './raceSpellIdentity'
import { parseSpellToken } from './spellTokens'

export interface RaceSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  castingAbility?: string
  dailyUses?: number | 'pb'
  source: 'innate' | 'known' | 'prepared'
}

interface RaceSpellChoiceDescriptor {
  id: string
  level: number
  count: number
  isCantrip: boolean
  source: RaceSpellGrant['source']
  usage: string
  dailyUses?: number | 'pb'
  filter?: { level: number; classes: string[] }
  pool?: string[]
}

export interface ParsedRaceSpellBlock {
  name?: string
  grants: RaceSpellGrant[]
  choices: RaceSpellChoiceDescriptor[]
  ability?: string
  abilityOptions?: string[]
  expanded?: Array<{ reference: string; spellLevel: number }>
  scheduleIdentity: string[]
}

/**
 * Parse a 5etools choose filter expression like `"level=0|class=Wizard"`
 * or `"level=0|class=Cleric;Druid;Wizard"`.
 */
export function parseChooseFilter(filter: string): { level: number; classes: string[] } {
  let level = 0
  const classes: string[] = []

  for (const segment of filter.split('|')) {
    const [key, value] = segment.split('=')
    if (!key || !value) throw new Error('Incomplete native spell filter.')
    const k = key.trim().toLowerCase()
    if (k === 'level') {
      const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9)
        throw new Error('Invalid native spell filter level.')
      level = parsed
    } else if (k === 'class') {
      for (const cls of value.split(';')) {
        const trimmed = cls.trim()
        if (trimmed) classes.push(trimmed)
      }
    } else throw new Error('Unsupported native spell filter field: ' + key)
  }

  return { level, classes }
}

function parseSchedule(
  entries: RaceSpellSchedule | undefined,
  ability: string | undefined,
  source: RaceSpellGrant['source'],
) {
  const grants: RaceSpellGrant[] = []
  const choices: RaceSpellChoiceDescriptor[] = []
  const scheduleIdentity: string[] = []
  for (const [levelText, schedule] of Object.entries(entries ?? {})) {
    const level = levelText === '_' ? 0 : /^\d+$/.test(levelText) ? Number(levelText) : NaN
    if (!Number.isInteger(level) || level < 0 || level > 20)
      throw new Error('Invalid native spell eligibility level.')
    const visit = (
      items: RaceSpellItem[] | undefined,
      dailyUses?: number | 'pb',
      usage = 'direct',
    ) => {
      const identities: string[] = []
      for (const item of items ?? []) {
        if (typeof item === 'string') {
          const parsed = parseSpellToken(item, { preserveSource: true, defaultSource: 'PHB' })
          const modifier =
            item
              .match(/#([^|]+)/)?.[1]
              ?.trim()
              .toLowerCase() ?? null
          identities.push(JSON.stringify([getSpellReferenceKey(parsed.name), modifier]))
          grants.push({
            spellName: parsed.name,
            level,
            isCantrip: parsed.isCantrip,
            castingAbility: ability,
            source,
            ...(dailyUses !== undefined ? { dailyUses } : {}),
          })
          continue
        }
        if (!item || typeof item !== 'object') throw new Error('Invalid native spell descriptor.')
        const count =
          item.count ?? (typeof item.choose === 'object' ? item.choose.count : undefined) ?? 1
        if (!Number.isInteger(count) || count <= 0)
          throw new Error('Invalid native spell choice count.')
        let target: Pick<RaceSpellChoiceDescriptor, 'isCantrip' | 'filter' | 'pool'>
        if (typeof item.choose === 'string') {
          const filter = parseChooseFilter(item.choose)
          target = { isCantrip: filter.level === 0, filter }
        } else if (item.choose && Array.isArray(item.choose.from)) {
          const parsed = item.choose.from.map((token) =>
            parseSpellToken(token, { preserveSource: true, defaultSource: 'PHB' }),
          )
          if (!parsed.length || parsed.some((entry) => entry.isCantrip !== parsed[0].isCantrip))
            throw new Error('A native spell pool must declare a consistent spell kind.')
          target = {
            isCantrip: parsed[0].isCantrip,
            pool: [
              ...new Map(
                parsed.map((entry) => [getSpellReferenceKey(entry.name), entry.name]),
              ).values(),
            ],
          }
        } else throw new Error('Unsupported native spell descriptor.')
        const descriptor = {
          level,
          count,
          source,
          usage,
          ...target,
          ...(dailyUses !== undefined ? { dailyUses } : {}),
        }
        const id = getRaceSpellChoiceKey(descriptor)
        choices.push({ ...descriptor, id })
        identities.push(id)
      }
      if (identities.length)
        scheduleIdentity.push(JSON.stringify([source, level, usage, identities.sort()]))
    }
    if (Array.isArray(schedule)) visit(schedule)
    else if (schedule && typeof schedule === 'object') {
      visit(schedule._)
      visit(schedule.will, undefined, 'will')
      visit(schedule.ritual, undefined, 'ritual')
      for (const [uses, items] of Object.entries(schedule.rest ?? {}))
        visit(items, undefined, 'rest:' + uses)
      for (const [uses, items] of Object.entries(schedule.daily ?? {})) {
        const dailyUses =
          uses === 'pb' ? 'pb' : /^\d+e?$/.test(uses) ? Number.parseInt(uses, 10) : NaN
        if (dailyUses === 'pb' || (Number.isInteger(dailyUses) && Number(dailyUses) > 0))
          visit(items, dailyUses, 'daily:' + uses)
        else throw new Error('Invalid native spell daily limit.')
      }
    }
  }
  return { grants, choices, scheduleIdentity }
}

function parseAbilityField(abilityField: string | { choose: string[] } | undefined): {
  ability?: string
  abilityOptions?: string[]
} {
  if (!abilityField) return {}
  if (typeof abilityField === 'string') return { ability: abilityField.trim().toLowerCase() }
  if (
    typeof abilityField === 'object' &&
    'choose' in abilityField &&
    Array.isArray(abilityField.choose)
  ) {
    return {
      abilityOptions: [
        ...new Set(abilityField.choose.map((ability) => ability.trim().toLowerCase())),
      ],
    }
  }
  return {}
}

/**
 * Parse a single additionalSpells block into structured grants and choices.
 */
function parseBlock(block: RaceAdditionalSpells): ParsedRaceSpellBlock {
  const { ability, abilityOptions } = parseAbilityField(block.ability)
  const resolvedAbility = ability

  const schedules = [
    parseSchedule(block.known, resolvedAbility, 'known'),
    parseSchedule(block.innate, resolvedAbility, 'innate'),
    parseSchedule(block.prepared, resolvedAbility, 'prepared'),
  ]
  const expanded = Object.entries(block.expanded ?? {}).flatMap(([key, references]) => {
    const spellLevel = /^s[0-9]$/.test(key) ? Number(key.slice(1)) : NaN
    if (!Number.isInteger(spellLevel)) return []
    return references.map((token) => ({
      reference: parseSpellToken(token, { preserveSource: true, defaultSource: 'PHB' }).name,
      spellLevel,
    }))
  })
  return {
    ...(block.name ? { name: block.name } : {}),
    grants: schedules.flatMap((schedule) => schedule.grants),
    choices: schedules.flatMap((schedule) => schedule.choices),
    ability: resolvedAbility,
    abilityOptions,
    scheduleIdentity: schedules.flatMap((schedule) => schedule.scheduleIdentity).sort(),
    ...(expanded.length ? { expanded } : {}),
  }
}

/**
 * Parse all additionalSpells blocks and determine mutual-exclusive vs single.
 *
 * Convention: `additionalSpells.length > 1` = mutually exclusive blocks (pick one).
 * Preserve whole blocks; the native profile evaluator activates one complete suite.
 */
export function parseRaceSpellBlocks(
  additionalSpells: RaceAdditionalSpells[] | undefined,
): ParsedRaceSpellBlock[] {
  if (!additionalSpells || additionalSpells.length === 0) return []
  return additionalSpells.map(parseBlock)
}

export function parseRaceSpells(
  additionalSpells: RaceAdditionalSpells[] | undefined,
): RaceSpellGrant[] {
  if (!additionalSpells || additionalSpells.length === 0) return []

  const blocks = parseRaceSpellBlocks(additionalSpells)
  const grants: RaceSpellGrant[] = []
  for (const block of blocks) {
    grants.push(...block.grants)
  }
  return grants
}
