import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type {
  AdditionalSpellBlock,
  AdditionalSpellItem,
  AdditionalSpellSchedule,
} from '@/types/additionalSpells'
import { getAdditionalSpellChoiceKey } from './additionalSpellIdentity'
import { parseSpellToken } from './spellTokens'

interface AdditionalSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  castingAbility?: string
  dailyUses?: number | 'pb'
  source: 'innate' | 'known' | 'prepared'
}

export interface AdditionalSpellChoiceDescriptor {
  id: string
  level: number
  count: number
  isCantrip: boolean
  source: AdditionalSpellGrant['source']
  usage: string
  dailyUses?: number | 'pb'
  filter?: { level: number; classes: string[] }
  pool?: string[]
}

export interface ParsedAdditionalSpellBlock {
  name?: string
  grants: AdditionalSpellGrant[]
  choices: AdditionalSpellChoiceDescriptor[]
  ability?: string
  abilityOptions?: string[]
  expanded?: Array<{ reference: string; spellLevel: number }>
  scheduleIdentity: string[]
}

function requireRecord(value: unknown, label: string, keys?: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid native spell ${label}.`)
  if (keys && Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`Unsupported native spell ${label} member.`)
}

function parseNativeSpellToken(token: string) {
  // Spell UIDs have one optional source and one optional casting modifier, on either side.
  if (
    typeof token !== 'string' ||
    !/^[^|#{}]+(?:#(?:c|[1-9]))?(?:\|[^|#{}]*(?:#(?:c|[1-9]))?)?$/i.test(token.trim()) ||
    (token.match(/#/g)?.length ?? 0) > 1
  )
    throw new Error('Invalid native spell token.')
  const parsed = parseSpellToken(token)
  if (!parsed.name.trim() || parsed.name.startsWith('|'))
    throw new Error('Invalid native spell token.')
  return parsed
}

/**
 * Parse a 5etools choose filter expression like `"level=0|class=Wizard"`
 * or `"level=0|class=Cleric;Druid;Wizard"`.
 */
export function parseAdditionalSpellFilter(
  filter: string,
  levelDefault?: number,
): { level: number; classes: string[] } {
  let level = 0
  let hasLevel = false
  const classes: string[] = []

  for (const segment of filter.split('|')) {
    const [key, value, extra] = segment.split('=')
    if (!key || !value || extra !== undefined) throw new Error('Incomplete native spell filter.')
    const k = key.trim().toLowerCase()
    if (k === 'level') {
      if (hasLevel) throw new Error('Duplicate native spell filter level.')
      hasLevel = true
      const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9)
        throw new Error('Invalid native spell filter level.')
      level = parsed
    } else if (k === 'class') {
      const suppliedClasses = value
        .split(';')
        .map((cls) => cls.trim())
        .filter(Boolean)
      if (!suppliedClasses.length) throw new Error('Incomplete native spell filter.')
      classes.push(...suppliedClasses)
    } else throw new Error('Unsupported native spell filter field: ' + key)
  }

  if (!hasLevel) {
    if (levelDefault === undefined) throw new Error('An explicit spell filter level is required.')
    level = levelDefault
  }
  return { level, classes }
}

function parseSchedule(
  entries: AdditionalSpellSchedule | undefined,
  ability: string | undefined,
  source: AdditionalSpellGrant['source'],
  levelDefault?: number,
) {
  const grants: AdditionalSpellGrant[] = []
  const choices: AdditionalSpellChoiceDescriptor[] = []
  const scheduleIdentity: string[] = []
  if (entries !== undefined) requireRecord(entries, 'schedule')
  for (const [levelText, schedule] of Object.entries(entries ?? {})) {
    const level = levelText === '_' ? 0 : /^\d+$/.test(levelText) ? Number(levelText) : NaN
    if (!Number.isInteger(level) || level < 0 || level > 20)
      throw new Error('Invalid native spell eligibility level.')
    const visit = (
      items: AdditionalSpellItem[] | undefined,
      dailyUses?: number | 'pb',
      usage = 'direct',
    ) => {
      if (items !== undefined && !Array.isArray(items))
        throw new Error('Invalid native spell list.')
      const identities: string[] = []
      for (const item of items ?? []) {
        if (typeof item === 'string') {
          const parsed = parseNativeSpellToken(item)
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
        requireRecord(item, 'descriptor', ['choose', 'count'])
        if (typeof item.choose !== 'string') {
          requireRecord(item.choose, 'choice', ['from', 'count'])
          if (
            item.count !== undefined &&
            item.choose.count !== undefined &&
            item.count !== item.choose.count
          )
            throw new Error('Conflicting native spell choice counts.')
        }
        const count =
          item.count ?? (typeof item.choose === 'object' ? item.choose.count : undefined) ?? 1
        const suppliedCounts = [
          item.count,
          typeof item.choose === 'object' ? item.choose.count : undefined,
        ]
        if (
          suppliedCounts.some(
            (value) => value !== undefined && (!Number.isSafeInteger(value) || value <= 0),
          )
        )
          throw new Error('Invalid native spell choice count.')
        let target: Pick<AdditionalSpellChoiceDescriptor, 'isCantrip' | 'filter' | 'pool'>
        if (typeof item.choose === 'string') {
          const filter = parseAdditionalSpellFilter(item.choose, levelDefault)
          target = { isCantrip: filter.level === 0, filter }
        } else if (item.choose && Array.isArray(item.choose.from)) {
          const parsed = item.choose.from.map(parseNativeSpellToken)
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
        const id = getAdditionalSpellChoiceKey(descriptor)
        choices.push({ ...descriptor, id })
        identities.push(id)
      }
      if (identities.length)
        scheduleIdentity.push(JSON.stringify([source, level, usage, identities.sort()]))
    }
    if (Array.isArray(schedule)) visit(schedule)
    else {
      requireRecord(schedule, 'schedule', ['_', 'will', 'ritual', 'rest', 'daily'])
      visit(schedule._)
      visit(schedule.will, undefined, 'will')
      visit(schedule.ritual, undefined, 'ritual')
      if (schedule.rest !== undefined) requireRecord(schedule.rest, 'rest limits')
      if (schedule.daily !== undefined) requireRecord(schedule.daily, 'daily limits')
      for (const [uses, items] of Object.entries(schedule.rest ?? {})) {
        if (!/^[1-9]\d*e?$/.test(uses) || !Number.isSafeInteger(Number.parseInt(uses, 10)))
          throw new Error('Invalid native spell rest limit.')
        visit(items, undefined, 'rest:' + uses)
      }
      for (const [uses, items] of Object.entries(schedule.daily ?? {})) {
        const dailyUses =
          uses === 'pb' ? 'pb' : /^[1-9]\d*e?$/.test(uses) ? Number.parseInt(uses, 10) : NaN
        if (dailyUses === 'pb' || (Number.isSafeInteger(dailyUses) && Number(dailyUses) > 0))
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
  if (abilityField === undefined) return {}
  const parseAbility = (value: string) => {
    if (typeof value !== 'string' || !/^(str|dex|con|int|wis|cha)$/i.test(value.trim()))
      throw new Error('Invalid native spell casting ability.')
    return value.trim().toLowerCase()
  }
  if (typeof abilityField === 'string') return { ability: parseAbility(abilityField) }
  requireRecord(abilityField, 'ability', ['choose'])
  if (!Array.isArray(abilityField.choose) || !abilityField.choose.length)
    throw new Error('Invalid native spell ability options.')
  return { abilityOptions: [...new Set(abilityField.choose.map(parseAbility))] }
}

/**
 * Parse a single additionalSpells block into structured grants and choices.
 */
function parseBlock(
  block: AdditionalSpellBlock,
  levelDefault?: number,
): ParsedAdditionalSpellBlock {
  requireRecord(block, 'block', ['name', 'ability', 'known', 'innate', 'prepared', 'expanded'])
  if (block.name !== undefined && (typeof block.name !== 'string' || !block.name.trim()))
    throw new Error('Invalid native spell block name.')
  const { ability, abilityOptions } = parseAbilityField(block.ability)
  const resolvedAbility = ability

  const schedules = [
    parseSchedule(block.known, resolvedAbility, 'known', levelDefault),
    parseSchedule(block.innate, resolvedAbility, 'innate', levelDefault),
    parseSchedule(block.prepared, resolvedAbility, 'prepared', levelDefault),
  ]
  if (block.expanded !== undefined) requireRecord(block.expanded, 'expanded list')
  const expanded = Object.entries(block.expanded ?? {}).flatMap(([key, references]) => {
    const spellLevel = /^s[0-9]$/.test(key) ? Number(key.slice(1)) : NaN
    if (!Number.isInteger(spellLevel) || !Array.isArray(references))
      throw new Error('Invalid native spell expanded list.')
    return references.map((token) => ({
      reference: parseNativeSpellToken(token).name,
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
 * Normalize supported data-only syntax, preserving complete blocks.
 * Actor adapters decide level meaning, ownership and alternative-block selection.
 * Syntax follows pinned 5etools b9061583 js/utils/utils-additionalspells.js;
 * the application deliberately rejects unsupported filters and resource constructs.
 */
export function parseAdditionalSpellBlocks(
  additionalSpells: AdditionalSpellBlock[] | undefined,
  options: { filterLevelDefault?: number } = {},
): ParsedAdditionalSpellBlock[] {
  if (additionalSpells === undefined) return []
  if (!Array.isArray(additionalSpells)) throw new Error('Invalid native spell blocks.')
  return additionalSpells.map((block) => parseBlock(block, options.filterLevelDefault))
}
