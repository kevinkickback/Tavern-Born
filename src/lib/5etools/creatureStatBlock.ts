import type { Creature5e } from '@/types/5etools'

/**
 * Creature field order and section semantics are adapted from 5etools'
 * `js/render-bestiary.js` classic stat-block renderer (v2.35.1, commit e5d0520).
 * Tavern Born produces a framework-neutral view model instead of importing the upstream
 * renderer's global Parser/Renderer runtime and site CSS.
 *
 * MIT License
 * Copyright (c) 2017 TheGiddyLimit and contributors
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Source: https://github.com/5etools-mirror-3/5etools-src/blob/e5d0520/js/render-bestiary.js
 */

const SIZE_NAMES: Record<string, string> = {
  F: 'Fine',
  D: 'Diminutive',
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
}

const ALIGNMENT_NAMES: Record<string, string> = {
  L: 'lawful',
  N: 'neutral',
  C: 'chaotic',
  G: 'good',
  E: 'evil',
  U: 'unaligned',
  A: 'any alignment',
}

const ABILITIES = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
] as const

interface CreatureStatLine {
  label: string
  value: string
}

interface CreatureAbilityStat {
  key: (typeof ABILITIES)[number][0]
  label: (typeof ABILITIES)[number][1]
  score: number | null
  modifier: string
}

interface CreatureStatSection {
  id: string
  title: string
  intro: unknown[]
  entries: unknown[]
}

interface CreatureNamedContent {
  name: string
  entries: unknown[]
}

export interface CreatureChoiceSummary {
  subtitle: string
  sizes: string[]
  creatureType: string
  challenge: string
  challengeValue: number | null
  armorClass: string
  hitPoints: string
  speed: string
  speedModes: string[]
  traits: CreatureNamedContent[]
  actions: CreatureNamedContent[]
}

export interface CreatureStatBlockModel {
  subtitle: string
  core: CreatureStatLine[]
  abilities: CreatureAbilityStat[]
  details: CreatureStatLine[]
  challenge: string
  proficiencyBonus: string
  sections: CreatureStatSection[]
  footer: CreatureStatLine[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function titleCase(value: string): string {
  return value.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())
}

function formatModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2)
  return modifier >= 0 ? `+${modifier}` : String(modifier)
}

function formatCreatureSize(value: unknown): string {
  return asArray(value)
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => SIZE_NAMES[entry] ?? entry)
    .join('/')
}

function formatTypeTag(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''
  return [value.prefix, value.tag, value.suffix]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ')
}

function formatCreatureType(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''

  const type = typeof value.type === 'string' ? value.type : ''
  const tags = asArray(value.tags).map(formatTypeTag).filter(Boolean)
  const taggedType = tags.length ? `${type} (${tags.join(', ')})` : type
  const swarmSize = typeof value.swarmSize === 'string' ? value.swarmSize : ''
  return swarmSize ? `swarm of ${SIZE_NAMES[swarmSize] ?? swarmSize} ${taggedType}s` : taggedType
}

function formatAlignmentPart(value: unknown): string {
  if (typeof value === 'string') return ALIGNMENT_NAMES[value] ?? value.toLowerCase()
  if (!isRecord(value)) return ''
  if (typeof value.special === 'string') return value.special

  const alignment = formatAlignment(value.alignment)
  const chance = typeof value.chance === 'number' ? ` (${value.chance}%)` : ''
  return `${alignment}${chance}`
}

function formatAlignment(value: unknown): string {
  return asArray(value).map(formatAlignmentPart).filter(Boolean).join(' ')
}

function formatArmorClass(value: unknown): string {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'number' || typeof entry === 'string') return String(entry)
      if (!isRecord(entry)) return ''
      if (typeof entry.special === 'string') return entry.special

      const armorClass = entry.ac
      const from = asArray(entry.from).filter((part): part is string => typeof part === 'string')
      const condition = typeof entry.condition === 'string' ? entry.condition : ''
      return [
        armorClass == null ? '' : String(armorClass),
        from.length ? `(${from.join(', ')})` : '',
        condition,
      ]
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
    .join(', ')
}

function formatHitPoints(value: unknown): string {
  if (!isRecord(value)) return ''
  return [
    value.average == null ? '' : String(value.average),
    typeof value.formula === 'string' ? `(${value.formula})` : '',
    typeof value.special === 'string' ? value.special : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function formatSpeedValue(value: unknown): string {
  if (typeof value === 'number') return `${value} ft.`
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''

  const amount = value.number ?? value.amount
  const distance = amount == null ? '' : `${String(amount)} ft.`
  const condition = typeof value.condition === 'string' ? value.condition : ''
  return [distance, condition].filter(Boolean).join(' ')
}

function formatSpeed(value: unknown): string {
  if (!isRecord(value)) return ''
  return Object.entries(value)
    .flatMap(([mode, speed]) => {
      if (mode === 'canHover' || speed === false || speed == null) return []
      const formatted = Array.isArray(speed)
        ? speed.map(formatSpeedValue).filter(Boolean).join(' or ')
        : formatSpeedValue(speed)
      if (!formatted) return []
      return [mode === 'walk' ? formatted : `${mode} ${formatted}`]
    })
    .join(', ')
}

function formatNestedList(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(formatNestedList).filter(Boolean).join(', ')
  if (!isRecord(value)) return ''
  if (typeof value.special === 'string') return value.special

  const nested = ['vulnerable', 'resist', 'immune', 'conditionImmune']
    .map((key) => formatNestedList(value[key]))
    .find(Boolean)
  const preNote = typeof value.preNote === 'string' ? value.preNote : ''
  const note = typeof value.note === 'string' ? value.note : ''
  return [preNote, nested, note].filter(Boolean).join(' ')
}

function formatBonusMap(value: unknown): string {
  if (!isRecord(value)) return ''
  return Object.entries(value)
    .map(([name, bonus]) => {
      if (name === 'special') return typeof bonus === 'string' ? bonus : ''
      const formatted = formatNestedList(bonus)
      return formatted ? `${titleCase(name)} ${formatted}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

function formatChallengeRating(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return ''
  const rating = value.cr
  return rating == null ? '' : String(rating)
}

function challengeRatingValue(value: unknown): number | null {
  const formatted = formatChallengeRating(value).trim()
  if (!formatted) return null
  const fraction = /^(\d+)\/(\d+)$/.exec(formatted)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator > 0 ? Number(fraction[1]) / denominator : null
  }
  const numeric = Number(formatted)
  return Number.isFinite(numeric) ? numeric : null
}

function formatProficiencyBonus(creature: Creature5e): string {
  const record = creature as Record<string, unknown>
  const proficiency = record.pb ?? record.proficiencyBonus
  if (typeof proficiency === 'number') {
    return proficiency >= 0 ? `+${proficiency}` : String(proficiency)
  }
  if (typeof proficiency === 'string') return proficiency
  return typeof record.pbNote === 'string' ? record.pbNote : ''
}

function namedContent(value: unknown): CreatureNamedContent[] {
  return asArray(value).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') return []
    return [{ name: entry.name, entries: asArray(entry.entries) }]
  })
}

function namedEntries(value: unknown): unknown[] {
  return namedContent(value).map((entry) => ({
    type: 'item',
    name: entry.name,
    entries: entry.entries,
  }))
}

function spellList(value: unknown): string {
  return asArray(value)
    .filter((entry): entry is string => typeof entry === 'string')
    .join(', ')
}

function frequencyLabel(key: string, period: string): string {
  const match = /^(\d+)(e)?$/.exec(key)
  if (!match) return `${key}/${period}`
  return `${match[1]}/${period}${match[2] ? ' each' : ''}`
}

function appendFrequencyEntries(entries: unknown[], value: unknown, period: string): void {
  if (!isRecord(value)) return
  for (const [frequency, spells] of Object.entries(value)) {
    const list = spellList(spells)
    if (list) entries.push(`{@b ${frequencyLabel(frequency, period)}:} ${list}`)
  }
}

function spellcastingEntries(value: unknown): unknown[] {
  return asArray(value).flatMap((spellcasting, index) => {
    if (!isRecord(spellcasting)) return []
    const entries: unknown[] = [...asArray(spellcasting.headerEntries)]

    for (const [key, label] of [
      ['constant', 'Constant'],
      ['will', 'At will'],
      ['ritual', 'Rituals'],
    ] as const) {
      const list = spellList(spellcasting[key])
      if (list) entries.push(`{@b ${label}:} ${list}`)
    }

    appendFrequencyEntries(entries, spellcasting.daily, 'day')
    appendFrequencyEntries(entries, spellcasting.rest, 'rest')
    appendFrequencyEntries(entries, spellcasting.weekly, 'week')
    appendFrequencyEntries(entries, spellcasting.yearly, 'year')

    if (isRecord(spellcasting.spells)) {
      for (const [level, valueAtLevel] of Object.entries(spellcasting.spells)) {
        if (!isRecord(valueAtLevel)) continue
        const list = spellList(valueAtLevel.spells)
        if (!list) continue
        const label =
          level === '0'
            ? 'Cantrips (at will)'
            : `Level ${level}${valueAtLevel.slots == null ? '' : ` (${String(valueAtLevel.slots)} slots)`}`
        entries.push(`{@b ${label}:} ${list}`)
      }
    }

    entries.push(...asArray(spellcasting.footerEntries))
    if (!entries.length) return []
    return [
      {
        type: 'item',
        name:
          typeof spellcasting.name === 'string' ? spellcasting.name : `Spellcasting ${index + 1}`,
        entries,
      },
    ]
  })
}

function buildSections(creature: Creature5e): CreatureStatSection[] {
  const record = creature as Record<string, unknown>
  const sections: CreatureStatSection[] = []
  const descriptions = asArray(record.entries)
  if (descriptions.length) {
    sections.push({ id: 'description', title: 'Description', intro: [], entries: descriptions })
  }

  const traits = [...spellcastingEntries(record.spellcasting), ...namedEntries(record.trait)]
  if (traits.length) sections.push({ id: 'traits', title: 'Traits', intro: [], entries: traits })

  for (const [id, title, field, introField] of [
    ['actions', 'Actions', 'action', 'actionHeader'],
    ['bonus-actions', 'Bonus Actions', 'bonus', 'bonusHeader'],
    ['reactions', 'Reactions', 'reaction', 'reactionHeader'],
    ['legendary-actions', 'Legendary Actions', 'legendary', 'legendaryHeader'],
    ['mythic-actions', 'Mythic Actions', 'mythic', 'mythicHeader'],
  ] as const) {
    const entries = namedEntries(record[field])
    if (entries.length) {
      sections.push({ id, title, intro: asArray(record[introField]), entries })
    }
  }

  return sections
}

export function buildCreatureStatBlock(creature: Creature5e): CreatureStatBlockModel {
  const record = creature as Record<string, unknown>
  const summary = buildCreatureChoiceSummary(creature)

  const core = [
    { label: 'Armor Class', value: summary.armorClass },
    { label: 'Hit Points', value: summary.hitPoints },
    { label: 'Speed', value: summary.speed },
  ].filter((line) => line.value)

  const abilities = ABILITIES.map(([key, label]) => {
    const score = typeof creature[key] === 'number' ? creature[key] : null
    return { key, label, score, modifier: score == null ? '—' : formatModifier(score) }
  })

  const senses = formatNestedList(record.senses)
  const passive =
    typeof record.passive === 'number' || typeof record.passive === 'string'
      ? `passive Perception ${String(record.passive)}`
      : ''
  const details = [
    { label: 'Saving Throws', value: formatBonusMap(record.save) },
    { label: 'Skills', value: formatBonusMap(record.skill) },
    { label: 'Damage Vulnerabilities', value: formatNestedList(record.vulnerable) },
    { label: 'Damage Resistances', value: formatNestedList(record.resist) },
    { label: 'Damage Immunities', value: formatNestedList(record.immune) },
    { label: 'Condition Immunities', value: formatNestedList(record.conditionImmune) },
    { label: 'Senses', value: [senses, passive].filter(Boolean).join(', ') },
    { label: 'Languages', value: formatNestedList(record.languages) || '—' },
  ].filter((line) => line.value)

  const footer = [
    { label: 'Habitat', value: formatNestedList(record.environment) },
    { label: 'Treasure', value: formatNestedList(record.treasure) },
    { label: 'Gear', value: formatNestedList(record.gear) },
  ].filter((line) => line.value)

  return {
    subtitle: summary.subtitle,
    core,
    abilities,
    details,
    challenge: summary.challenge,
    proficiencyBonus: formatProficiencyBonus(creature),
    sections: buildSections(creature),
    footer,
  }
}

/** Compact, structured creature facts shared by stat blocks and choice cards. */
export function buildCreatureChoiceSummary(creature: Creature5e): CreatureChoiceSummary {
  const record = creature as Record<string, unknown>
  const size = formatCreatureSize(creature.size)
  const sizes = size ? size.split('/') : []
  const creatureType = formatCreatureType(creature.type)
  const alignment = formatAlignment(record.alignment)
  const typeLine = [size, creatureType].filter(Boolean).join(' ')
  const speedModes = isRecord(creature.speed)
    ? Object.entries(creature.speed).flatMap(([mode, value]) =>
        mode === 'canHover' || value === false || value == null ? [] : [mode],
      )
    : []

  return {
    subtitle: typeLine + (alignment ? `, ${alignment}` : ''),
    sizes,
    creatureType,
    challenge: formatChallengeRating(creature.cr),
    challengeValue: challengeRatingValue(creature.cr),
    armorClass: formatArmorClass(creature.ac),
    hitPoints: formatHitPoints(creature.hp),
    speed: formatSpeed(creature.speed),
    speedModes,
    traits: namedContent(record.trait),
    actions: namedContent(record.action),
  }
}
