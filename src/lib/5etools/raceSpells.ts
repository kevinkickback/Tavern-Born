import type { RaceAdditionalSpells } from '@/types/5etools'

export interface RaceSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  castingAbility?: string
  dailyUses?: number
  source: 'innate' | 'known'
}

export interface RaceSpellChoiceDescriptor {
  id: string
  count: number
  isCantrip: boolean
  filter?: { level: number; classes: string[] }
  pool?: string[]
}

export interface ParsedRaceSpellBlock {
  grants: RaceSpellGrant[]
  choices: RaceSpellChoiceDescriptor[]
  ability?: string
  abilityOptions?: string[]
}

function parseSpellToken(raw: string): { name: string; isCantrip: boolean } {
  const token = raw.trim()
  const isCantrip = token.toLowerCase().endsWith('#c')
  return {
    name: isCantrip ? token.slice(0, -2).trim() : token,
    isCantrip,
  }
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
    if (!key || !value) continue
    const k = key.trim().toLowerCase()
    if (k === 'level') {
      const parsed = Number.parseInt(value.trim(), 10)
      if (Number.isFinite(parsed)) level = parsed
    } else if (k === 'class') {
      for (const cls of value.split(';')) {
        const trimmed = cls.trim()
        if (trimmed) classes.push(trimmed)
      }
    }
  }

  return { level, classes }
}

function parseKnownBlock(
  levelEntries: Record<string, string[] | { _: Array<string | { choose: string }> }>,
  ability: string | undefined,
): { grants: RaceSpellGrant[]; choices: RaceSpellChoiceDescriptor[] } {
  const grants: RaceSpellGrant[] = []
  const choices: RaceSpellChoiceDescriptor[] = []
  let choiceIdx = 0

  for (const [levelText, spellData] of Object.entries(levelEntries)) {
    const level = Number.parseInt(levelText, 10)
    if (!Number.isFinite(level)) continue

    if (Array.isArray(spellData)) {
      for (const rawSpell of spellData) {
        if (typeof rawSpell !== 'string') continue
        const parsed = parseSpellToken(rawSpell)
        grants.push({
          spellName: parsed.name,
          level,
          isCantrip: parsed.isCantrip,
          castingAbility: ability,
          source: 'known',
        })
      }
    } else if (spellData && typeof spellData === 'object' && '_' in spellData) {
      const items = spellData._
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (typeof item === 'string') {
          const parsed = parseSpellToken(item)
          grants.push({
            spellName: parsed.name,
            level,
            isCantrip: parsed.isCantrip,
            castingAbility: ability,
            source: 'known',
          })
        } else if (item && typeof item === 'object' && 'choose' in item) {
          const filter = parseChooseFilter(item.choose as string)
          choices.push({
            id: `choose-${choiceIdx++}`,
            count: 1,
            isCantrip: filter.level === 0,
            filter,
          })
        }
      }
    }
  }

  return { grants, choices }
}

function parseInnateBlock(
  innateEntries: Record<string, Record<string, Record<string, string[]>>>,
  ability: string | undefined,
): RaceSpellGrant[] {
  const grants: RaceSpellGrant[] = []

  for (const [levelText, usageMap] of Object.entries(innateEntries)) {
    const level = Number.parseInt(levelText, 10)
    if (!Number.isFinite(level) || !usageMap || typeof usageMap !== 'object') continue

    const daily = (usageMap as Record<string, unknown>).daily
    if (!daily || typeof daily !== 'object') continue

    for (const [usesText, spells] of Object.entries(daily as Record<string, unknown>)) {
      const dailyUses = Number.parseInt(usesText, 10)
      if (!Number.isFinite(dailyUses) || !Array.isArray(spells)) continue

      for (const rawSpell of spells) {
        if (typeof rawSpell !== 'string') continue
        const parsed = parseSpellToken(rawSpell)
        grants.push({
          spellName: parsed.name,
          level,
          isCantrip: parsed.isCantrip,
          castingAbility: ability,
          dailyUses,
          source: 'innate',
        })
      }
    }
  }

  return grants
}

function parseAbilityField(abilityField: string | { choose: string[] } | undefined): {
  ability?: string
  abilityOptions?: string[]
} {
  if (!abilityField) return {}
  if (typeof abilityField === 'string') return { ability: abilityField }
  if (
    typeof abilityField === 'object' &&
    'choose' in abilityField &&
    Array.isArray(abilityField.choose)
  ) {
    return { abilityOptions: abilityField.choose }
  }
  return {}
}

/**
 * Parse a single additionalSpells block into structured grants and choices.
 */
function parseBlock(block: RaceAdditionalSpells): ParsedRaceSpellBlock {
  const { ability, abilityOptions } = parseAbilityField(block.ability)
  const resolvedAbility = ability

  const knownResult = block.known
    ? parseKnownBlock(block.known, resolvedAbility)
    : { grants: [], choices: [] }
  const innateGrants = block.innate ? parseInnateBlock(block.innate, resolvedAbility) : []

  return {
    grants: [...knownResult.grants, ...innateGrants],
    choices: knownResult.choices,
    ability: resolvedAbility,
    abilityOptions,
  }
}

/**
 * Parse all additionalSpells blocks and determine mutual-exclusive vs single.
 *
 * Convention: `additionalSpells.length > 1` = mutually exclusive blocks (pick one).
 * Each block's fixed spells become a `pool` choice. Single block = all fixed spells
 * apply, plus any internal choose filters.
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
