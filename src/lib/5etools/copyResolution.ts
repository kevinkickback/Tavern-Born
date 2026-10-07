/** Resolve 5etools `_copy` records before they are used as game entities.
 *
 * This is deliberately data-only: 5etools' browser DataUtil depends on global renderers and
 * parsers. Unsupported transformations leave the original record intact and produce a diagnostic.
 * Version and copy semantics adapt DataUtil.generic from the pinned upstream revision.
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
 * Source: https://github.com/5etools-mirror-3/5etools-src/blob/e5d052071b635f58cc8006e9727053eaf78ea8f9/js/utils.js
 */
import { toAbilityAbbrev } from '@/lib/calculations/abilityNames'
import { getSkillAbility } from '@/lib/calculations/skills'

type Record5e = Record<string, unknown> & { name: string; source: string }
type CopyKind = 'item' | 'monster' | 'race' | 'subrace'

export interface CopyResolutionDiagnostic {
  entity: string
  reason: string
}

export class CopyResolutionError extends Error {
  constructor(
    readonly diagnostics: CopyResolutionDiagnostic[],
    context: string,
  ) {
    const first = diagnostics[0]
    super(
      `Unable to resolve ${diagnostics.length} copied ${diagnostics.length === 1 ? 'record' : 'records'} ${context}. ${first.entity}: ${first.reason}`,
    )
    this.name = 'CopyResolutionError'
  }
}

const PRESERVED = new Set([
  'page',
  'otherSources',
  'referenceSources',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'hasFluff',
  'hasFluffImages',
  'hasToken',
  'tokenCredit',
  'tokenCustom',
  'foundryTokenScale',
  'altArt',
  '_versions',
])
const MONSTER_PRESERVED = new Set([
  'legendaryGroup',
  'environment',
  'soundClip',
  'variant',
  'dragonCastingColor',
  'familiar',
])
const ITEM_PRESERVED = new Set(['lootTables', 'tier'])
const RESERVED_PROPS = new Set(['__proto__', 'constructor', 'prototype'])
const ENTRY_PROPS = [
  'action',
  'bonus',
  'reaction',
  'trait',
  'legendary',
  'mythic',
  'variant',
  'spellcasting',
  'actionHeader',
  'bonusHeader',
  'reactionHeader',
  'legendaryHeader',
  'mythicHeader',
]

function object(value: unknown, field?: string): Record<string, unknown> {
  if (field !== undefined) value = ownValue(object(value), field)
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : Object.create(null)
}

function pathParts(path: string): string[] {
  const parts = path.split('.')
  if (parts.some((part) => RESERVED_PROPS.has(part)))
    throw new Error(`unsafe copy property ${path}`)
  return parts
}

function assertSafeData(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [field, nested] of Object.entries(value)) {
    pathParts(field)
    if (field === 'prop' && typeof nested === 'string') pathParts(nested)
    if (field === 'props' && Array.isArray(nested)) {
      for (const property of nested) {
        if (typeof property === 'string') pathParts(property)
      }
    }
    assertSafeData(nested)
  }
}

function ownValue(record: Record<string, unknown>, field: string): unknown {
  return Object.getOwnPropertyDescriptor(record, field)?.value
}

function directive(value: unknown): Record<string, unknown> {
  return Object.assign(Object.create(null), object(value))
}

function ownArray(record: Record<string, unknown>, field: string): unknown[] {
  const value = ownValue(record, field)
  return Array.isArray(value) ? value : []
}

function key(value: Record<string, unknown>, kind?: CopyKind): string {
  const fields =
    kind === 'subrace' ? ['name', 'source', 'raceName', 'raceSource'] : ['name', 'source']
  return fields
    .map((field) =>
      String(
        ownValue(value, field) ??
          (field.startsWith('race') ? ownValue(object(value, '_copy'), field) : '') ??
          '',
      )
        .trim()
        .toLowerCase(),
    )
    .join('|')
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

function dataEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => dataEquals(value, right[index]))
    )
  }
  const fields = Object.keys(left)
  return (
    fields.length === Object.keys(right).length &&
    fields.every(
      (field) =>
        Object.getOwnPropertyDescriptor(right, field) !== undefined &&
        dataEquals(ownValue(object(left), field), ownValue(object(right), field)),
    )
  )
}

function pathContainer(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : Object.create(null)
}

function at(root: Record<string, unknown>, path: string): unknown {
  return pathParts(path).reduce<unknown>(
    (value, part) => ownValue(pathContainer(value), part),
    root,
  )
}

function setAt(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = pathParts(path)
  let target = root
  for (const part of parts.slice(0, -1)) {
    if (!ownValue(target, part) || typeof ownValue(target, part) !== 'object')
      target[part] = Object.create(null)
    target = pathContainer(ownValue(target, part))
  }
  target[parts[parts.length - 1]] = value
}

function removeAt(root: Record<string, unknown>, path: string): void {
  const parts = pathParts(path)
  const parent = parts
    .slice(0, -1)
    .reduce<Record<string, unknown>>((target, part) => pathContainer(ownValue(target, part)), root)
  delete parent[parts[parts.length - 1]]
}

function replaceText(
  value: unknown,
  re: RegExp,
  replacement: string,
  includeTags: boolean,
): unknown {
  if (typeof value === 'string') {
    if (includeTags) return value.replace(re, replacement)
    return value
      .split(/(\{@[^}]*\})/g)
      .map((part) => (part.startsWith('{@') ? part : part.replace(re, replacement)))
      .join('')
  }
  if (Array.isArray(value))
    return value.map((part) => replaceText(part, re, replacement, includeTags))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([part, nested]) => [
        part,
        replaceText(nested, re, replacement, includeTags),
      ]),
    )
  }
  return value
}

function itemName(value: unknown): unknown {
  return ownValue(object(value), 'name') ?? value
}

function proficiencyBonus(record: Record5e): number {
  const raw = ownValue(record, 'cr')
  const cr = raw && typeof raw === 'object' ? ownValue(object(raw), 'cr') : raw
  const number =
    typeof cr === 'string' && cr.includes('/')
      ? Number(cr.split('/')[0]) / Number(cr.split('/')[1])
      : Number(cr)
  return number < 5 ? 2 : Math.floor((number - 1) / 4) + 2
}

function shortName(record: Record5e, title: boolean): string {
  const named = ownValue(record, 'isNamedCreature') === true
  const fullName = String(ownValue(record, 'name') ?? '')
  const short = ownValue(record, 'shortName')
  const prefix = named ? '' : title ? 'The ' : 'the '
  if (short === true) return `${prefix}${fullName}`
  const raw =
    typeof short === 'string'
      ? short
      : fullName.split(',')[0].replace(/(?:adult|ancient|young) \w+ (dragon|dracolich)/gi, '$1')
  const name = named && !short ? raw.split(' ')[0] : raw.toLowerCase()
  return `${prefix}${named && title ? name.replace(/^./, (char) => char.toUpperCase()) : name}`
}

function resolveVariables(value: unknown, record: Record5e): unknown {
  if (typeof value === 'string')
    return value.replace(/<\$([^$]+)\$>/g, (match, token: string) => {
      const [mode, ability] = token.split('__')
      const scoreValue = ownValue(record, ability)
      const score = typeof scoreValue === 'number' ? scoreValue : Number.NaN
      const bonus = Math.floor((score - 10) / 2)
      if (mode === 'short_name') return shortName(record, false)
      if (mode === 'title_short_name') return shortName(record, true)
      if (mode === 'name') return String(ownValue(record, 'name') ?? '')
      if (mode === 'spell_dc' || mode === 'dc') return String(8 + bonus + proficiencyBonus(record))
      if (mode === 'to_hit') {
        const total = bonus + proficiencyBonus(record)
        return `${total >= 0 ? '+' : ''}${total}`
      }
      if (mode === 'damage_mod')
        return bonus === 0 ? '' : bonus > 0 ? ` + ${bonus}` : ` - ${-bonus}`
      if (mode === 'damage_avg') {
        const expression = ability.replace(/\b(str|dex|con|int|wis|cha)\b/g, (name) =>
          String(Math.floor((Number(ownValue(record, name)) - 10) / 2)),
        )
        if (/^\s*-?\d+(?:\.\d+)?\s*\+\s*-?\d+(?:\.\d+)?\s*$/.test(expression)) {
          return String(
            Math.floor(expression.split('+').reduce((sum, part) => sum + Number(part), 0)),
          )
        }
      }
      throw new Error(`unsupported copy variable ${match}`)
    })
  if (Array.isArray(value)) return value.map((entry) => resolveVariables(entry, record))
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([field, entry]) => [field, resolveVariables(entry, record)]),
    )
  return value
}

function applySpellMod(target: Record5e, mode: string, mod: Record<string, unknown>): void {
  const spellcasting = ownArray(target, 'spellcasting')
  const named = typeof mod.name === 'string' ? mod.name.trim().toLowerCase() : ''
  const entry = named
    ? spellcasting.find(
        (value) =>
          String(ownValue(object(value), 'name') ?? '')
            .trim()
            .toLowerCase() === named,
      )
    : spellcasting[0]
  if (!entry)
    throw new Error(named ? `spellcasting ${mod.name} is missing` : 'spellcasting is missing')
  const casting = object(entry)
  const mergeSpellGroup = (group: Record<string, unknown>, additions: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(additions)) {
      const current = ownValue(group, key)
      if (Array.isArray(value)) group[key] = [...(Array.isArray(current) ? current : []), ...value]
      else if (value && typeof value === 'object') {
        if (!current || typeof current !== 'object') group[key] = Object.create(null)
        mergeSpellGroup(object(group[key]), object(value))
      } else group[key] = value
    }
  }
  if (mode === 'addSpells') {
    for (const [section, value] of Object.entries(mod)) {
      if (section === 'mode' || section === 'name') continue
      if (Array.isArray(value)) casting[section] = [...ownArray(casting, section), ...value]
      else if (value && typeof value === 'object') {
        if (!ownValue(casting, section)) casting[section] = Object.create(null)
        mergeSpellGroup(object(casting[section]), object(value))
      }
    }
    return
  }
  const replace = (spells: unknown[], edits: unknown[]): unknown[] => {
    const next = [...spells]
    for (const edit of edits) {
      const change = directive(edit)
      const index = next.indexOf(change.replace)
      if (index < 0) throw new Error(`spell ${String(change.replace)} not found`)
      next.splice(index, 1, ...array(change.with))
    }
    return next.sort((a, b) => String(a).localeCompare(String(b)))
  }
  const spellLevels = object(casting, 'spells')
  for (const [level, changes] of Object.entries(object(mod.spells))) {
    const block = object(ownValue(spellLevels, level))
    const spells = ownArray(block, 'spells')
    block.spells =
      mode === 'replaceSpells'
        ? replace(spells, array(changes))
        : spells.filter((spell) => !array(changes).includes(spell))
  }
  for (const [section, changes] of Object.entries(mod)) {
    if (section === 'mode' || section === 'name' || section === 'spells') continue
    if (Array.isArray(changes)) {
      if (mode === 'removeSpells')
        casting[section] = ownArray(casting, section).filter((spell) => !changes.includes(spell))
      continue
    }
    for (const [usage, edits] of Object.entries(object(changes))) {
      const sectionRecord = object(ownValue(casting, section))
      const current = ownValue(sectionRecord, usage)
      const spells = Array.isArray(current) ? current : []
      sectionRecord[usage] =
        mode === 'replaceSpells'
          ? replace(spells, array(edits))
          : spells.filter((spell) => !array(edits).includes(spell))
    }
  }
}

function applyMod(target: Record5e, prop: string, raw: unknown): void {
  if (raw === 'remove') {
    removeAt(target, prop)
    return
  }
  const mod = directive(raw)
  const mode = mod.mode
  const existing = at(target, prop)
  const items = array(mod.items)
  if (mode === 'appendArr' || mode === 'prependArr' || mode === 'appendIfNotExistsArr') {
    const current = Array.isArray(existing) ? existing : []
    const added =
      mode === 'appendIfNotExistsArr'
        ? items.filter((item) => !current.some((value) => dataEquals(value, item)))
        : items
    setAt(target, prop, mode === 'prependArr' ? [...added, ...current] : [...current, ...added])
    return
  }
  if (mode === 'replaceArr' || mode === 'insertArr' || mode === 'removeArr') {
    if (!Array.isArray(existing)) throw new Error(`${prop} is not an array`)
    if (mode === 'insertArr') {
      existing.splice(
        typeof mod.index === 'number' && mod.index !== -1 ? mod.index : existing.length,
        0,
        ...items,
      )
      return
    }
    if (mode === 'removeArr') {
      const removals = mod.names === undefined ? array(mod.items) : array(mod.names)
      for (const removal of removals) {
        const index = existing.findIndex((value) => itemName(value) === removal)
        if (index < 0 && mod.force !== true)
          throw new Error(`${prop} entry ${String(removal)} not found`)
        if (index >= 0) existing.splice(index, 1)
      }
      return
    }
    const replace = mod.replace
    const replacement = directive(replace)
    const pattern = replacement.regex
    const index =
      typeof pattern === 'string'
        ? existing.findIndex((value) =>
            new RegExp(pattern, String(replacement.flags ?? '')).test(String(itemName(value))),
          )
        : typeof replacement.index === 'number'
          ? replacement.index
          : existing.findIndex((value) => itemName(value) === replace)
    if (index < 0 || index >= existing.length) throw new Error(`${prop} replacement not found`)
    existing.splice(index, 1, ...items)
    return
  }
  if (mode === 'replaceTxt') {
    const re = new RegExp(String(mod.replace), `g${String(mod.flags ?? '')}`)
    const properties = (mod.props as unknown[] | undefined) ?? [
      null,
      'entries',
      'headerEntries',
      'footerEntries',
    ]
    if (!Array.isArray(existing)) return
    setAt(
      target,
      prop,
      existing.map((entry) => {
        if (typeof entry === 'string')
          return properties.includes(null)
            ? replaceText(entry, re, String(mod.with ?? ''), mod.tagInsensitive === true)
            : entry
        const copy = object(entry)
        for (const property of properties) {
          if (typeof property === 'string' && ownValue(copy, property)) {
            copy[property] = replaceText(
              copy[property],
              re,
              String(mod.with ?? ''),
              mod.tagInsensitive === true,
            )
          }
        }
        return entry
      }),
    )
    return
  }
  if (mode === 'setProp') {
    setAt(
      target,
      prop === '_' || prop === '*' ? String(mod.prop) : `${prop}.${String(mod.prop)}`,
      clone(mod.value),
    )
    return
  }
  if (mode === 'addSkills') {
    const proficiency = proficiencyBonus(target)
    const skills = directive(ownValue(target, 'skill'))
    for (const [skill, rank] of Object.entries(object(mod.skills))) {
      const abilityName = getSkillAbility(skill)
      const ability = abilityName ? ownValue(target, toAbilityAbbrev(abilityName) ?? '') : undefined
      if (typeof ability !== 'number' || !Number.isFinite(proficiency))
        throw new Error(`cannot calculate ${skill}`)
      const bonus = Math.floor((ability - 10) / 2) + Number(rank) * proficiency
      if (!skills[skill] || Number(skills[skill]) < bonus)
        skills[skill] = `${bonus >= 0 ? '+' : ''}${bonus}`
    }
    target.skill = skills
    return
  }
  if (mode === 'addSenses') {
    const senses = ownArray(target, 'senses')
    for (const senseValue of array(mod.senses)) {
      const sense = directive(senseValue)
      const name = String(sense.type)
      const range = Number(sense.range)
      const index = senses.findIndex((value) =>
        new RegExp(`^${name} \\d+`, 'i').test(String(value)),
      )
      if (index < 0) senses.push(`${name} ${range} ft.`)
      else if (Number(String(senses[index]).match(/\d+/)?.[0]) < range)
        senses[index] = `${name} ${range} ft.`
    }
    target.senses = senses
    return
  }
  if (mode === 'maxSize') {
    const sizes = ['T', 'S', 'M', 'L', 'H', 'G']
    const max = sizes.indexOf(String(mod.max))
    const current = ownArray(target, 'size')
    target.size = current.filter((size) => sizes.indexOf(String(size)) <= max)
    if (!(target.size as unknown[]).length) target.size = [mod.max]
    return
  }
  if (mode === 'scalarAddProp' || mode === 'scalarMultProp') {
    if (!existing) return
    if (typeof existing !== 'object') throw new Error(`${prop} is not an object`)
    const record = pathContainer(existing)
    const properties = mod.prop === '*' ? Object.keys(record) : [String(mod.prop)]
    for (const property of properties) {
      const original = ownValue(record, property)
      let result =
        mode === 'scalarAddProp'
          ? Number(original) + Number(mod.scalar)
          : Number(original) * Number(mod.scalar)
      if (mod.floor) result = Math.floor(result)
      record[property] =
        typeof original === 'string' ? `${result >= 0 ? '+' : ''}${result}` : result
    }
    return
  }
  if (mode === 'prefixSuffixStringProp') {
    const path = prop === '_' || prop === '*' ? String(mod.prop) : `${prop}.${String(mod.prop)}`
    const current = at(target, path)
    if (typeof current === 'string')
      setAt(target, path, `${mod.prefix ?? ''}${current}${mod.suffix ?? ''}`)
    return
  }
  if (mode === 'scalarAddHit' || mode === 'scalarAddDc') {
    const tag = mode === 'scalarAddHit' ? 'hit' : 'dc'
    const adjust = (value: unknown): unknown => {
      if (typeof value === 'string')
        return value.replace(
          new RegExp(`\\{@${tag} ([-+]?\\d+)(?:\\|[^}]*)?\\}`, 'g'),
          (_, amount: string) => `{@${tag} ${Number(amount) + Number(mod.scalar)}}`,
        )
      if (Array.isArray(value)) return value.map(adjust)
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, adjust(v)]))
      return value
    }
    setAt(target, prop, adjust(existing))
    return
  }
  if (mode === 'addSpells' || mode === 'replaceSpells' || mode === 'removeSpells') {
    applySpellMod(target, mode, mod)
    return
  }
  if (mode === 'scalarMultXp') {
    // Tavern Born does not consume the derived CR-to-XP field. Preserve explicit XP if present.
    const challenge = object(target, 'cr')
    const xp = ownValue(challenge, 'xp')
    if (typeof xp === 'number') {
      const value = xp * Number(mod.scalar)
      challenge.xp = mod.floor ? Math.floor(value) : value
    }
    return
  }
  throw new Error(`unsupported _mod mode ${String(mode)}`)
}

function applyMods(target: Record5e, mods: Record<string, unknown>): void {
  assertSafeData(mods)
  const rank = (prop: string) => (prop === '_' ? 1 : prop === '*' ? 2 : 0)
  const keys = Object.keys(mods).sort((a, b) => rank(a) - rank(b))
  for (const prop of keys) {
    const targets = prop === '*' ? ENTRY_PROPS : [prop]
    for (const operation of array(mods[prop])) {
      for (const targetProp of targets) applyMod(target, targetProp, operation)
    }
  }
}

function materializeCopy(
  own: Record5e,
  inherited: Record5e,
  kind: CopyKind,
  templateByKey: ReadonlyMap<string, Record5e>,
): Record5e {
  assertSafeData(own)
  assertSafeData(inherited)
  const copy = directive(ownValue(own, '_copy'))
  for (const field of ['_mod', '_preserve']) {
    const value = ownValue(copy, field)
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value)))
      throw new Error(`invalid ${field} directive`)
  }
  if (copy._templates !== undefined && !Array.isArray(copy._templates))
    throw new Error('invalid _templates directive')
  const rootProps = new Set(Object.keys(own))
  const preserve = directive(copy._preserve)
  const protectedProps =
    kind === 'item' ? ITEM_PRESERVED : kind === 'monster' ? MONSTER_PRESERVED : new Set<string>()
  for (const [field, value] of Object.entries(inherited)) {
    if (ownValue(own, field) === null) {
      delete own[field]
      continue
    }
    if (ownValue(own, field) !== undefined) continue
    if (
      (PRESERVED.has(field) || protectedProps.has(field)) &&
      preserve['*'] !== true &&
      preserve[field] !== true
    )
      continue
    own[field] = value
  }
  const appliedTemplates: Record5e[] = []
  for (const reference of Array.isArray(copy._templates) ? copy._templates : []) {
    const template = templateByKey.get(key(reference as Record5e))
    if (!template) throw new Error(`missing template ${key(reference as Record5e)}`)
    if (ownValue(template, '_copy'))
      throw new Error(`unresolved template ${key(reference as Record5e)}`)
    assertSafeData(template)
    appliedTemplates.push(template)
    for (const [field, value] of Object.entries(object(object(template, 'apply'), '_root'))) {
      if (!rootProps.has(field)) own[field] = clone(value)
    }
  }
  const mergedMods: Record<string, unknown[]> = Object.create(null)
  for (const modMap of [
    object(copy._mod),
    ...appliedTemplates.map((template) => object(object(template, 'apply'), '_mod')),
  ]) {
    for (const [prop, operations] of Object.entries(modMap)) {
      mergedMods[prop] ??= []
      mergedMods[prop].push(...array(operations))
    }
  }
  applyMods(own, object(resolveVariables(mergedMods, own)))
  delete own._copy
  return own
}

export function resolveCopiedRecords<T extends { name: string; source: string }>(
  records: readonly T[],
  kind: CopyKind,
  templates: readonly Record5e[] = [],
): { records: T[]; diagnostics: CopyResolutionDiagnostic[] } {
  const byKey = new Map(records.map((record) => [key(record, kind), record]))
  const resolvedTemplates = templates.length ? resolveCopiedRecords(templates, kind).records : []
  const templateByKey = new Map(resolvedTemplates.map((template) => [key(template), template]))
  const resolved = new Map<string, T>()
  const diagnostics: CopyResolutionDiagnostic[] = []
  const active = new Set<string>()

  const visit = (record: T): T => {
    const identity = key(record, kind)
    if (resolved.has(identity)) return resolved.get(identity) as T
    if (!Object.getOwnPropertyDescriptor(record, '_copy')) return record
    try {
      // Validate the whole directive before any operation, including later failing operations.
      assertSafeData(record)
      const own = clone(record) as Record5e
      const copy = directive(ownValue(own, '_copy'))
      if (active.has(identity)) throw new Error('copy cycle')
      active.add(identity)
      if (typeof copy.name !== 'string' || typeof copy.source !== 'string')
        throw new Error('invalid parent reference')
      const parent = byKey.get(key(copy, kind))
      if (!parent) throw new Error(`missing parent ${copy.name}|${copy.source}`)
      const inherited = clone(visit(parent)) as Record5e
      assertSafeData(inherited)
      if (ownValue(inherited, '_copy'))
        throw new Error(`unresolved parent ${copy.name}|${copy.source}`)
      materializeCopy(own, inherited, kind, templateByKey)
      resolved.set(identity, own as T)
      return own as T
    } catch (error) {
      if (!resolved.has(identity))
        diagnostics.push({ entity: `${record.name}|${record.source}`, reason: String(error) })
      resolved.set(identity, record)
      return record
    } finally {
      active.delete(identity)
    }
  }

  return { records: records.map(visit), diagnostics }
}

/** Data-only adaptation of DataUtil.generic.getVersions, pinned to 5etools e5d0520. */
export function resolveRecordVersions(
  parent: Record5e,
  kind: CopyKind,
): { records: Record5e[]; diagnostics: CopyResolutionDiagnostic[] } {
  const records: Record5e[] = []
  const diagnostics: CopyResolutionDiagnostic[] = []
  const versions = ownValue(parent, '_versions')
  if (versions === undefined) return { records, diagnostics }
  if (!Array.isArray(versions)) {
    return {
      records,
      diagnostics: [
        { entity: `${parent.name}|${parent.source}`, reason: '_versions is not an array' },
      ],
    }
  }

  const expandCopy = (raw: unknown): Record<string, unknown> => {
    const version = clone(object(raw))
    version._copy = {
      _mod: version._mod,
      _templates: version._templates,
      _preserve: version._preserve ?? { '*': true },
    }
    delete version._mod
    delete version._templates
    delete version._preserve
    return version
  }
  const substitute = (value: unknown, variables: Record<string, unknown>): unknown => {
    if (typeof value === 'string')
      return value.replace(/\{\{([^}]+)}}/g, (_, name: string) => {
        const replacement = ownValue(variables, name)
        if (typeof replacement !== 'string' && typeof replacement !== 'number')
          throw new Error(`missing or invalid version variable ${name}`)
        return String(replacement)
      })
    if (Array.isArray(value)) return value.map((entry) => substitute(entry, variables))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([field, entry]) => [field, substitute(entry, variables)]),
      )
    return value
  }

  for (const [index, raw] of versions.entries()) {
    try {
      assertSafeData(raw)
      const version = object(raw)
      const implementations = ownValue(version, '_implementations')
      const abstract = ownValue(version, '_abstract')
      if (abstract !== undefined && (!Array.isArray(implementations) || !implementations.length))
        throw new Error('version template has no implementations')
      const expanded =
        abstract === undefined
          ? [expandCopy(version)]
          : (implementations as unknown[]).map((rawImplementation) => {
              const implementation = clone(object(rawImplementation))
              const template = substitute(
                expandCopy(abstract),
                object(implementation._variables),
              ) as Record<string, unknown>
              delete implementation._variables
              return { ...template, ...implementation }
            })
      for (const version of expanded) {
        if (typeof version.name !== 'string' || !version.name.trim())
          throw new Error('version has no name')
        if (version._mod !== undefined)
          throw new Error('implementation modifications must use _copy._mod')
        if (!version._copy || typeof version._copy !== 'object' || Array.isArray(version._copy))
          throw new Error('invalid version copy directive')
        if (
          version.source !== undefined &&
          (typeof version.source !== 'string' || !version.source.trim())
        )
          throw new Error('invalid version source')
        const inherited = clone(parent)
        for (const field of [
          '_versions',
          'hasToken',
          'hasFluff',
          'hasFluffImages',
          'subraces',
          'presentationEntries',
        ])
          delete inherited[field]
        const source = typeof version.source === 'string' ? version.source : parent.source
        for (const field of ['additionalSources', 'otherSources', 'referenceSources']) {
          const sources = ownArray(inherited, field).filter(
            (entry) => ownValue(object(entry), 'source') !== source,
          )
          if (sources.length) inherited[field] = sources
          else delete inherited[field]
        }
        const resolved = materializeCopy(
          { ...version, name: version.name, source },
          inherited,
          kind,
          new Map(),
        )
        delete resolved._versions
        records.push(resolved)
      }
    } catch (error) {
      diagnostics.push({
        entity: `${parent.name}|${parent.source}/_versions[${index}]`,
        reason: String(error),
      })
    }
  }
  return { records, diagnostics }
}
