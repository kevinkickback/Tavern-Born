/** Resolve 5etools `_copy` records before they are used as game entities.
 *
 * This is deliberately data-only: 5etools' browser DataUtil depends on global renderers and
 * parsers. Unsupported transformations leave the original record intact and produce a diagnostic.
 */
import { toAbilityAbbrev } from '@/lib/calculations/abilityNames'
import { getSkillAbility } from '@/lib/calculations/skills'

type Record5e = Record<string, unknown> & { name: string; source: string }

export interface CopyResolutionDiagnostic {
  entity: string
  reason: string
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function key(value: { name: string; source: string }): string {
  return `${value.name.trim().toLowerCase()}|${value.source.trim().toLowerCase()}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

function at(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, part) => object(value)[part], root)
}

function setAt(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let target = root
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {}
    target = object(target[part])
  }
  target[parts[parts.length - 1]] = value
}

function removeAt(root: Record<string, unknown>, path: string): void {
  const parts = path.split('.')
  const parent = parts
    .slice(0, -1)
    .reduce<Record<string, unknown>>((target, part) => object(target[part]), root)
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
  return object(value).name ?? value
}

function proficiencyBonus(record: Record5e): number {
  const cr = object(record.cr).cr ?? record.cr
  const number =
    typeof cr === 'string' && cr.includes('/')
      ? Number(cr.split('/')[0]) / Number(cr.split('/')[1])
      : Number(cr)
  return number < 5 ? 2 : Math.floor((number - 1) / 4) + 2
}

function shortName(record: Record5e, title: boolean): string {
  const named = record.isNamedCreature === true
  const prefix = named ? '' : title ? 'The ' : 'the '
  if (record.shortName === true) return `${prefix}${record.name}`
  const raw =
    typeof record.shortName === 'string'
      ? record.shortName
      : record.name.split(',')[0].replace(/(?:adult|ancient|young) \w+ (dragon|dracolich)/gi, '$1')
  const name = named && !record.shortName ? raw.split(' ')[0] : raw.toLowerCase()
  return `${prefix}${named && title ? name.replace(/^./, (char) => char.toUpperCase()) : name}`
}

function resolveVariables(value: unknown, record: Record5e): unknown {
  if (typeof value === 'string')
    return value.replace(/<\$([^$]+)\$>/g, (match, token: string) => {
      const [mode, ability] = token.split('__')
      const score = typeof record[ability] === 'number' ? (record[ability] as number) : Number.NaN
      const bonus = Math.floor((score - 10) / 2)
      if (mode === 'short_name') return shortName(record, false)
      if (mode === 'title_short_name') return shortName(record, true)
      if (mode === 'name') return record.name
      if (mode === 'spell_dc' || mode === 'dc') return String(8 + bonus + proficiencyBonus(record))
      if (mode === 'to_hit') {
        const total = bonus + proficiencyBonus(record)
        return `${total >= 0 ? '+' : ''}${total}`
      }
      if (mode === 'damage_mod')
        return bonus === 0 ? '' : bonus > 0 ? ` + ${bonus}` : ` - ${-bonus}`
      if (mode === 'damage_avg') {
        const expression = ability.replace(/\b(str|dex|con|int|wis|cha)\b/g, (name) =>
          String(Math.floor((Number(record[name]) - 10) / 2)),
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
  const casting = Array.isArray(target.spellcasting) ? object(target.spellcasting[0]) : null
  if (!casting) throw new Error('spellcasting is missing')
  const mergeSpellGroup = (group: Record<string, unknown>, additions: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(additions)) {
      if (Array.isArray(value))
        group[key] = [...(Array.isArray(group[key]) ? (group[key] as unknown[]) : []), ...value]
      else if (value && typeof value === 'object') {
        if (!group[key]) group[key] = {}
        mergeSpellGroup(object(group[key]), object(value))
      } else group[key] = value
    }
  }
  if (mode === 'addSpells') {
    for (const [section, value] of Object.entries(mod)) {
      if (section === 'mode' || section === 'name') continue
      if (Array.isArray(value))
        casting[section] = [
          ...(Array.isArray(casting[section]) ? (casting[section] as unknown[]) : []),
          ...value,
        ]
      else if (value && typeof value === 'object') {
        if (!casting[section]) casting[section] = {}
        mergeSpellGroup(object(casting[section]), object(value))
      }
    }
    return
  }
  const replace = (spells: unknown[], edits: unknown[]): unknown[] => {
    const next = [...spells]
    for (const edit of edits) {
      const change = object(edit)
      const index = next.indexOf(change.replace)
      if (index < 0) throw new Error(`spell ${String(change.replace)} not found`)
      next.splice(index, 1, ...array(change.with))
    }
    return next.sort((a, b) => String(a).localeCompare(String(b)))
  }
  const spellLevels = object(casting.spells)
  for (const [level, changes] of Object.entries(object(mod.spells))) {
    const block = object(spellLevels[level])
    const spells = Array.isArray(block.spells) ? block.spells : []
    block.spells =
      mode === 'replaceSpells'
        ? replace(spells, array(changes))
        : spells.filter((spell) => !array(changes).includes(spell))
  }
  for (const [section, changes] of Object.entries(mod)) {
    if (section === 'mode' || section === 'spells') continue
    if (Array.isArray(changes)) {
      if (mode === 'removeSpells')
        casting[section] = (
          Array.isArray(casting[section]) ? (casting[section] as unknown[]) : []
        ).filter((spell) => !changes.includes(spell))
      continue
    }
    for (const [usage, edits] of Object.entries(object(changes))) {
      const sectionRecord = object(casting[section])
      const spells = Array.isArray(sectionRecord[usage]) ? (sectionRecord[usage] as unknown[]) : []
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
  const mod = object(raw)
  const mode = mod.mode
  const existing = at(target, prop)
  const items = array(mod.items)
  if (mode === 'appendArr' || mode === 'prependArr' || mode === 'appendIfNotExistsArr') {
    const current = Array.isArray(existing) ? existing : []
    const added =
      mode === 'appendIfNotExistsArr'
        ? items.filter(
            (item) => !current.some((value) => JSON.stringify(value) === JSON.stringify(item)),
          )
        : items
    setAt(target, prop, mode === 'prependArr' ? [...added, ...current] : [...current, ...added])
    return
  }
  if (mode === 'replaceArr' || mode === 'insertArr' || mode === 'removeArr') {
    if (!Array.isArray(existing)) throw new Error(`${prop} is not an array`)
    if (mode === 'insertArr') {
      existing.splice(typeof mod.index === 'number' ? mod.index : existing.length, 0, ...items)
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
    const pattern = object(replace).regex
    const index =
      typeof pattern === 'string'
        ? existing.findIndex((value) =>
            new RegExp(pattern, String(object(replace).flags ?? '')).test(String(itemName(value))),
          )
        : typeof object(replace).index === 'number'
          ? (object(replace).index as number)
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
          if (typeof property === 'string' && copy[property]) {
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
    const skills = { ...object(target.skill) }
    for (const [skill, rank] of Object.entries(object(mod.skills))) {
      const abilityName = getSkillAbility(skill)
      const ability = abilityName ? target[toAbilityAbbrev(abilityName) ?? ''] : undefined
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
    const senses = Array.isArray(target.senses) ? target.senses : []
    for (const senseValue of array(mod.senses)) {
      const sense = object(senseValue)
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
    const current = Array.isArray(target.size) ? target.size : []
    target.size = current.filter((size) => sizes.indexOf(String(size)) <= max)
    if (!(target.size as unknown[]).length) target.size = [mod.max]
    return
  }
  if (mode === 'scalarAddProp' || mode === 'scalarMultProp') {
    const record = object(existing)
    const properties = mod.prop === '*' ? Object.keys(record) : [String(mod.prop)]
    for (const property of properties) {
      const original = record[property]
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
    const path = `${prop}.${String(mod.prop)}`
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
    const challenge = object(target.cr)
    if (typeof challenge.xp === 'number') {
      const value = challenge.xp * Number(mod.scalar)
      challenge.xp = mod.floor ? Math.floor(value) : value
    }
    return
  }
  throw new Error(`unsupported _mod mode ${String(mode)}`)
}

function applyMods(target: Record5e, mods: Record<string, unknown>): void {
  const rank = (prop: string) => (prop === '_' ? 1 : prop === '*' ? 2 : 0)
  const keys = Object.keys(mods).sort((a, b) => rank(a) - rank(b))
  for (const prop of keys) {
    const targets = prop === '*' ? ENTRY_PROPS : [prop]
    for (const operation of array(mods[prop])) {
      for (const targetProp of targets) applyMod(target, targetProp, operation)
    }
  }
}

export function resolveCopiedRecords<T extends { name: string; source: string }>(
  records: readonly T[],
  kind: 'item' | 'monster',
  templates: readonly Record5e[] = [],
): { records: T[]; diagnostics: CopyResolutionDiagnostic[] } {
  const byKey = new Map(records.map((record) => [key(record), record]))
  const templateByKey = new Map(templates.map((template) => [key(template), template]))
  const resolved = new Map<string, T>()
  const diagnostics: CopyResolutionDiagnostic[] = []
  const active = new Set<string>()

  const visit = (record: T): T => {
    const identity = key(record)
    if (resolved.has(identity)) return resolved.get(identity) as T
    const copy = object((record as Record5e)._copy)
    if (!copy.name) return record
    try {
      if (active.has(identity)) throw new Error('copy cycle')
      active.add(identity)
      if (typeof copy.name !== 'string' || typeof copy.source !== 'string')
        throw new Error('invalid parent reference')
      const parent = byKey.get(key(copy as Record5e))
      if (!parent) throw new Error(`missing parent ${copy.name}|${copy.source}`)
      const inherited = clone(visit(parent)) as Record5e
      if (inherited._copy) throw new Error(`unresolved parent ${copy.name}|${copy.source}`)
      const own = clone(record) as Record5e
      const preserve = object(copy._preserve)
      const protectedProps = kind === 'item' ? ITEM_PRESERVED : MONSTER_PRESERVED
      for (const [field, value] of Object.entries(inherited)) {
        if (own[field] === null) {
          delete own[field]
          continue
        }
        if (own[field] !== undefined) continue
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
        appliedTemplates.push(template)
        for (const [field, value] of Object.entries(object(object(template.apply)._root))) {
          if (!(field in record)) own[field] = clone(value)
        }
      }
      for (const template of appliedTemplates)
        applyMods(own, object(resolveVariables(object(object(template.apply)._mod), own)))
      applyMods(own, object(resolveVariables(copy._mod, own)))
      delete own._copy
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
