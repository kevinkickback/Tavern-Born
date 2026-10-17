import type { GameData, Item5e, ItemEntryDiagnostic } from '@/types/5etools'
import { resolveCopiedRecords } from './copyResolution'

// Data-only reference adaptation of Renderer.item and SourceUtil at 5etools b9061583:
// https://github.com/5etools-mirror-3/5etools-src/tree/b9061583536101068b3a59d27e886d1fa664e366/js
// Raw templates remain a separate authority; this module does not generate equipment.
type Definition = Record<string, unknown> & { name: string; source: string }
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const tuple = (name: string, source: string) =>
  JSON.stringify([name.trim().toLowerCase(), source.trim().toLowerCase()])

/** SourceUtil's raw copy identity precedes inherited reference-property projection. */
export function magicVariantIdentity(value: unknown): string | undefined {
  const row = record(value)
  if (!row || (row.source !== undefined && typeof row.source !== 'string')) return undefined
  const name = text(row.name)
  const source = text(row.source) || text(record(row.inherits)?.source)
  return name && source ? tuple(name, source) : undefined
}

export function parseMagicVariantTemplates(data: unknown): unknown[] {
  const obj = record(data)
  const rows = obj?.variant ?? obj?.magicvariant ?? data
  return Array.isArray(rows) ? rows : []
}

/** Keep malformed and duplicate winning rows; neither may silently revive a prior template. */
export function mergeMagicVariants(layers: readonly (readonly unknown[])[]): unknown[] {
  return layers.reduce<unknown[]>((merged, rows) => {
    const replaced = new Set(rows.map(magicVariantIdentity).filter(Boolean))
    return [...merged.filter((row) => !replaced.has(magicVariantIdentity(row))), ...rows]
  }, [])
}

function referenceEntries(value: unknown, fields: Record<string, unknown>): unknown {
  if (typeof value === 'string')
    return value.replace(/\{=([^}]+)\}/g, (_token, field: string) => {
      const replacement = fields[field]
      return typeof replacement === 'string' || typeof replacement === 'number'
        ? String(replacement)
        : '[value unavailable]'
    })
  if (Array.isArray(value)) return value.map((entry) => referenceEntries(entry, fields))
  const obj = record(value)
  return obj
    ? Object.fromEntries(
        Object.entries(obj).map(([key, entry]) => [key, referenceEntries(entry, fields)]),
      )
    : value
}

function validDefinition(row: Definition, partial = false): boolean {
  const inherits = record(row.inherits)
  return (
    ((partial && row.type === undefined) || isGenericType(row.type)) &&
    ((partial && row.inherits === undefined) || Boolean(inherits)) &&
    (!inherits || !('source' in inherits) || Boolean(text(inherits.source))) &&
    (row.entries == null || Array.isArray(row.entries)) &&
    (inherits?.entries == null || Array.isArray(inherits.entries))
  )
}

/** Resolve only canonical template parents. Concrete items and derived references never enter here. */
export function resolveMagicVariants(rows: readonly unknown[]): {
  definitions: Definition[]
  references: Item5e[]
  diagnostics: ItemEntryDiagnostic[]
} {
  const diagnostics: ItemEntryDiagnostic[] = []
  const diagnose = (path: string, message: string) => {
    if (diagnostics.length < 32) diagnostics.push({ path, message })
  }
  const groups = new Map<string, Definition[]>()
  for (const [index, value] of rows.entries()) {
    const identity = magicVariantIdentity(value)
    const row = record(value)
    if (!identity || !row) {
      diagnose(`magicVariants[${index}]`, 'Invalid canonical template identity.')
      continue
    }
    const source = text(row.source) || text(record(row.inherits)?.source)
    const normalized = { ...row, name: text(row.name), source }
    groups.set(identity, [...(groups.get(identity) ?? []), normalized])
  }
  const candidates = [...groups.values()].flatMap((values) => {
    const row = values[0]
    const path = `magicVariants.${row.name}|${row.source}`
    if (values.length !== 1) {
      diagnose(path, 'Ambiguous canonical template.')
      return []
    }
    if (!validDefinition(row, '_copy' in row)) {
      diagnose(path, 'Invalid template type, inheritance block, reference source or entries.')
      return []
    }
    return [row]
  })
  const resolved = resolveCopiedRecords(candidates, 'magicvariant')
  for (const issue of resolved.diagnostics) diagnose(`magicVariants.${issue.entity}`, issue.reason)
  const unavailable = new Set(
    resolved.records.flatMap((row, index) =>
      '_copy' in row ||
      !validDefinition(row) ||
      magicVariantIdentity(row) !== magicVariantIdentity(candidates[index])
        ? [magicVariantIdentity(candidates[index])]
        : [],
    ),
  )
  // A failed resolved parent cannot become authority merely because a descendant repairs its fields.
  let changed = true
  while (changed) {
    changed = false
    for (const row of candidates) {
      const parent = record(row._copy)
      const identity = magicVariantIdentity(row)
      if (parent && unavailable.has(magicVariantIdentity(parent)) && !unavailable.has(identity)) {
        unavailable.add(identity)
        changed = true
      }
    }
  }
  const definitions: Definition[] = []
  const projections = new Map<string, Item5e[]>()
  for (const [index, row] of resolved.records.entries()) {
    if ('_copy' in row) continue
    const inherits = record(row.inherits)
    if (
      unavailable.has(magicVariantIdentity(candidates[index])) ||
      !isGenericType(row.type) ||
      !inherits
    ) {
      diagnose(
        `magicVariants.${row.name}|${row.source}`,
        'Unavailable resolved template or parent.',
      )
      continue
    }
    const target = candidates[index]
    definitions.push({ ...row, name: target.name, source: target.source })
    // Upstream applies inherited properties after copy resolution. A distinct inherited source
    // is legitimate; an explicit unusable source must not fall back to the raw copy owner.
    const source = 'source' in inherits ? text(inherits.source) : target.source
    const projection = {
      ...row,
      ...inherits,
      name: target.name,
      source,
      type: row.type,
      magicVariantReference: { name: target.name, source: target.source },
    } as Item5e
    const entries = row.entries ?? inherits.entries
    if (entries !== undefined)
      projection.entries = referenceEntries(entries, projection) as unknown[]
    const identity = tuple(row.name, source)
    projections.set(identity, [...(projections.get(identity) ?? []), projection])
  }
  const references = [...projections.values()].flatMap((values) => {
    if (values.length === 1) return values
    diagnose(`magicVariants.${values[0].name}|${values[0].source}`, 'Ambiguous reference identity.')
    return []
  })
  return { definitions, references, diagnostics }
}

function isGenericType(value: unknown): value is string {
  return typeof value === 'string' && value.split('|')[0].trim().toUpperCase() === 'GV'
}

/** References follow concrete copy resolution and can never replace an actual equipment tuple. */
export function appendMagicVariantReferences(data: GameData): void {
  const result = resolveMagicVariants(data.magicVariants ?? [])
  const occupied = new Set(
    [...data.items, ...data.itemsBase].map((item) => tuple(item.name, item.source)),
  )
  data.magicVariantDiagnostics = result.diagnostics
  const references = result.references.filter((reference) => {
    if (!occupied.has(tuple(reference.name, reference.source))) return true
    if (result.diagnostics.length < 32)
      result.diagnostics.push({
        path: `magicVariants.${reference.name}|${reference.source}`,
        message: 'Reference collides with concrete equipment; concrete item retained.',
      })
    return false
  })
  data.items = [...data.items, ...references]
}
