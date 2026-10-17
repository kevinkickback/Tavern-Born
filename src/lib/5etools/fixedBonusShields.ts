import type { GameData, Item5e, ItemEntryDiagnostic } from '@/types/5etools'
import { getRawItems } from './itemEntries'

// Bounded adaptation of Renderer.item at 5etools b9061583 (render.js:12942–13382).
type Row = Record<string, unknown>
const record = (v: unknown): Row | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : undefined
const identity = (r: Row) =>
  JSON.stringify([r.name, r.source].map((x) => String(x).trim().toLowerCase()))
const isShieldTarget = (v: unknown): v is Row => {
  const r = record(v)
  return (
    typeof r?.name === 'string' &&
    r.name.trim().toLowerCase() === 'shield' &&
    typeof r.source === 'string' &&
    ['phb', 'xphb'].includes(r.source.trim().toLowerCase())
  )
}

/** Serializable raw authority precedes ordinary itemsBase duplicate collapse. */
export function getFixedShieldBases(data: GameData): unknown[] {
  return data.fixedShieldBases ?? getRawItems(data).itemsBase.filter(isShieldTarget)
}

export function mergeFixedShieldBases(layers: readonly GameData[]): unknown[] {
  return layers.reduce<unknown[]>((merged, layer) => {
    const rows = getFixedShieldBases(layer),
      replaced = new Set(rows.filter(isShieldTarget).map(identity))
    return [...merged.filter((r) => !isShieldTarget(r) || !replaced.has(identity(r))), ...rows]
  }, [])
}

const BASE_FIELDS = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'referenceSources',
  'reprintedAs',
  'edition',
  'type',
  'rarity',
  'weight',
  'value',
  'ac',
  'entries',
  'hasFluff',
  'hasFluffImages',
])
const TEMPLATE_FIELDS = new Set([
  'name',
  'source',
  'type',
  'edition',
  'requires',
  'excludes',
  'entries',
  'inherits',
])
const INHERITED_FIELDS = new Set([
  'namePrefix',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'tier',
  'rarity',
  'bonusAc',
  'entries',
  'classFeatures',
  'lootTables',
])

/** Upstream OR-of-AND requirements and any-key exclusions use own fields. */
function matches(candidate: unknown, requirements: Row, every: boolean): boolean {
  if (candidate == null) return false
  return Object.entries(requirements)[every ? 'every' : 'some'](([key, requirement]) => {
    const value = Object.getOwnPropertyDescriptor(candidate, key)?.value
    if (Array.isArray(requirement))
      return Array.isArray(value)
        ? value.some((x) => requirement.includes(x))
        : requirement.includes(value)
    const nested = record(requirement)
    if (nested) return matches(value, nested, every)
    return Array.isArray(value) ? value.includes(requirement) : value === requirement
  })
}

function validMetadata(row: Row): boolean {
  return (
    ['srd', 'srd52'].every(
      (key) =>
        row[key] === undefined || typeof row[key] === 'boolean' || typeof row[key] === 'string',
    ) &&
    ['basicRules', 'basicRules2024'].every(
      (key) => row[key] === undefined || typeof row[key] === 'boolean',
    ) &&
    ['rarity', 'tier'].every((key) => row[key] === undefined || typeof row[key] === 'string') &&
    ['page', 'weight', 'value'].every(
      (key) =>
        row[key] === undefined || (typeof row[key] === 'number' && Number.isFinite(row[key])),
    ) &&
    ['referenceSources', 'reprintedAs', 'classFeatures', 'lootTables'].every(
      (key) =>
        row[key] === undefined ||
        (Array.isArray(row[key]) && row[key].every((value) => typeof value === 'string')),
    )
  )
}

function validBase(row: Row, source: string): boolean {
  return (
    row.name === 'Shield' &&
    row.source === source &&
    validMetadata(row) &&
    Object.keys(row).every((k) => BASE_FIELDS.has(k)) &&
    row.type === (source === 'PHB' ? 'S' : 'S|XPHB') &&
    row.edition === (source === 'PHB' ? 'classic' : 'one') &&
    row.rarity === 'none' &&
    typeof row.ac === 'number' &&
    Number.isFinite(row.ac) &&
    (row.weight === undefined || (typeof row.weight === 'number' && Number.isFinite(row.weight))) &&
    (row.entries === undefined || Array.isArray(row.entries)) &&
    Boolean(source === 'PHB' ? row.srd || row.basicRules : row.srd52 || row.basicRules2024)
  )
}

export function generateFixedBonusShields(
  data: GameData,
  definitions: readonly Row[],
): { items: Item5e[]; diagnostics: ItemEntryDiagnostic[] } {
  const diagnostics: ItemEntryDiagnostic[] = []
  const diagnose = (path: string, message: string) => {
    if (diagnostics.length < 32) diagnostics.push({ path: `magicVariants.${path}`, message })
  }
  const groups = new Map<string, Row[]>()
  for (const value of getFixedShieldBases(data)) {
    if (!isShieldTarget(value)) continue
    const key = identity(value)
    groups.set(key, [...(groups.get(key) ?? []), value])
  }
  const occupied = new Set([...data.items, ...data.itemsBase].map(identity)),
    generated = new Map<string, Item5e[]>()
  for (const definition of definitions) {
    const match = /^\+([123]) Shield \(\*\)$/.exec(String(definition.name))
    if (!match || !['DMG', 'XDMG'].includes(String(definition.source))) continue
    const source = String(definition.source),
      baseSource = source === 'DMG' ? 'PHB' : 'XPHB',
      path = `${definition.name}|${source}`
    const inherited = record(definition.inherits),
      requires = definition.requires
    if (
      !inherited ||
      !Object.keys(definition).every((key) => TEMPLATE_FIELDS.has(key)) ||
      !validMetadata(inherited) ||
      definition.type !== `GV|${source}` ||
      inherited.source !== source ||
      inherited.namePrefix !== `+${match[1]} ` ||
      inherited.bonusAc !== `+${match[1]}` ||
      !Array.isArray(inherited.entries) ||
      !Object.keys(inherited).every((k) => INHERITED_FIELDS.has(k)) ||
      !Array.isArray(requires) ||
      !requires.every((row) => record(row)) ||
      (definition.excludes !== undefined && !record(definition.excludes)) ||
      ![undefined, 'classic', 'one'].includes(definition.edition as string | undefined)
    ) {
      diagnose(path, 'Unsupported fixed-shield template shape.')
      continue
    }
    const bases = groups.get(identity({ name: 'Shield', source: baseSource })) ?? []
    if (bases.length !== 1 || !validBase(bases[0], baseSource)) {
      diagnose(
        path,
        bases.length
          ? 'Ambiguous or unsupported direct public Shield base.'
          : 'Unavailable exact public Shield base.',
      )
      continue
    }
    const base = bases[0]
    const editionMatches =
      base.edition === definition.edition ||
      (base.edition === 'one' && definition.edition !== 'classic')
    if (
      !editionMatches ||
      !requires.some((row) => matches(base, row, true)) ||
      (record(definition.excludes) && matches(base, definition.excludes as Row, false))
    )
      continue
    let entries: unknown[]
    try {
      let unsupported = false
      const encoded = JSON.stringify(inherited.entries).replace(
        /\{=([^}]+)}/g,
        (_token, field: string) => {
          if (field !== 'bonusAc') unsupported = true
          return String(inherited.bonusAc)
        },
      )
      if (unsupported) throw new Error('Unsupported property injector')
      entries = JSON.parse(encoded)
    } catch {
      diagnose(path, 'Unsupported fixed-shield text injector.')
      continue
    }
    const output = structuredClone(base) as unknown as Item5e
    for (const key of [
      'value',
      'srd',
      'srd52',
      'basicRules',
      'basicRules2024',
      'page',
      'reprintedAs',
      'referenceSources',
      'hasFluff',
      'hasFluffImages',
    ])
      delete output[key]
    for (const [key, value] of Object.entries(inherited))
      if (!['namePrefix', 'entries', 'reprintedAs'].includes(key))
        output[key] = structuredClone(value)
    output.name = `+${match[1]} ${base.name}`
    output.entries = [...entries, ...structuredClone((base.entries ?? []) as unknown[])]
    output.baseItem = `shield|${baseSource.toLowerCase()}`
    output.genericVariant = { name: definition.name, source }
    output.magicVariantGenerated = {
      base: { name: 'Shield', source: baseSource },
      template: { name: String(definition.name), source },
    }
    const key = identity(output)
    if (occupied.has(key)) {
      diagnose(path, 'Generated shield collides with concrete equipment; concrete item retained.')
      continue
    }
    generated.set(key, [...(generated.get(key) ?? []), output])
  }
  const items = [...generated.values()].flatMap((rows) => {
    if (rows.length === 1) return rows
    diagnose(`${rows[0].name}|${rows[0].source}`, 'Ambiguous generated shield identity.')
    return []
  })
  return { items, diagnostics }
}
