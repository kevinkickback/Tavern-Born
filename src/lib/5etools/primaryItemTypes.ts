import type {
  GameData,
  Item5e,
  ItemEntry5e,
  ItemEntryDiagnostic,
  ItemType5e,
} from '@/types/5etools'
import { resolveCopiedRecords } from './copyResolution'
import { expandItemEntries } from './itemEntries'

const UNAVAILABLE = '[Item type rules unavailable]'
const rawTypes = new WeakMap<GameData, ItemType5e[]>()
const normalize = (value: string) => value.trim().toLowerCase()
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

/** Definition identity is abbreviation/source; display name and concrete item source are unrelated. */
export function primaryItemTypeIdentity(value: unknown): string | undefined {
  const row = record(value)
  if (
    typeof row?.abbreviation !== 'string' ||
    !row.abbreviation.trim() ||
    (row.source !== undefined && typeof row.source !== 'string')
  )
    return undefined
  return JSON.stringify([
    normalize(row.abbreviation),
    normalize((row.source as string) || '') || 'phb',
  ])
}

export function parsePrimaryItemTypes(data: unknown): {
  records: ItemType5e[]
  diagnostics: ItemEntryDiagnostic[]
} {
  const rows = record(data)?.itemType
  if (rows === undefined) return { records: [], diagnostics: [] }
  if (!Array.isArray(rows))
    return {
      records: [],
      diagnostics: [{ path: 'itemType', message: 'Expected an optional array.' }],
    }
  return {
    records: rows.filter((row) => record(row)) as ItemType5e[],
    diagnostics: rows
      .flatMap((row, index) =>
        primaryItemTypeIdentity(row)
          ? []
          : [{ path: `itemType[${index}]`, message: 'Invalid primary type identity.' }],
      )
      .slice(0, 32),
  }
}

export function getRawItemTypes(data: GameData): ItemType5e[] {
  return rawTypes.get(data) ?? data.itemTypes
}

/** Keep ambiguous winners and identifiable malformed overrides instead of reviving base prose. */
export function mergePrimaryItemTypes(layers: readonly (readonly ItemType5e[])[]): ItemType5e[] {
  return layers.reduce<ItemType5e[]>((merged, rows) => {
    const replaced = new Set(rows.map(primaryItemTypeIdentity).filter(Boolean))
    return [...merged.filter((row) => !replaced.has(primaryItemTypeIdentity(row))), ...rows]
  }, [])
}

/** Re-resolve copies from raw winning parents on every composition, never from inherited snapshots. */
export function resolvePrimaryItemTypes(data: GameData): void {
  rawTypes.set(data, data.itemTypes)
  const groups = new Map<string, ItemType5e[]>()
  for (const row of data.itemTypes) {
    const identity = primaryItemTypeIdentity(row)
    if (identity) groups.set(identity, [...(groups.get(identity) ?? []), row])
  }
  const definitions = [...groups.values()].map((rows): ItemType5e => {
    const row = rows[0]
    const diagnostics: ItemEntryDiagnostic[] = []
    if (rows.length > 1) diagnostics.push({ path: 'itemType', message: 'Ambiguous primary type.' })
    if (row.entries !== undefined && row.entries !== null && !Array.isArray(row.entries))
      diagnostics.push({ path: 'itemType.entries', message: 'Expected an entries array.' })
    if ('entriesTemplate' in row)
      diagnostics.push({
        path: 'itemType.entriesTemplate',
        message: 'Primary templates are unsupported.',
      })
    return {
      ...row,
      abbreviation: row.abbreviation.trim(),
      source: typeof row.source === 'string' && row.source.trim() ? row.source.trim() : 'PHB',
      name: typeof row.name === 'string' && row.name.trim() ? row.name : row.abbreviation.trim(),
      ...(diagnostics.length ? { itemTypeDiagnostics: diagnostics } : {}),
    }
  })
  // Invalid or duplicate parents must not enter the generic copy engine's single-winner index.
  const valid = definitions.filter((row) => !row.itemTypeDiagnostics?.length)
  const resolved = resolveCopiedRecords(valid, 'itemType')
  const byIdentity = new Map(resolved.records.map((row) => [primaryItemTypeIdentity(row), row]))
  data.itemTypes = definitions.map((row) => {
    const result = byIdentity.get(primaryItemTypeIdentity(row)) ?? row
    if (!('_copy' in result)) return result
    return {
      ...result,
      itemTypeDiagnostics: [
        ...(result.itemTypeDiagnostics ?? []),
        { path: 'itemType._copy', message: 'Unresolved primary type copy.' },
      ].slice(0, 32),
    }
  })
}

/** Primary rules are intrinsic metadata of the resolved item, not optional selected-book rules. */
export function associatePrimaryItemTypes(
  items: readonly Item5e[],
  definitions: readonly ItemType5e[],
  fragments: readonly ItemEntry5e[],
): Item5e[] {
  const byIdentity = new Map<string, ItemType5e[]>()
  for (const row of definitions) {
    const identity = primaryItemTypeIdentity(row)
    if (identity) byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), row])
  }
  return items.map((item) => {
    const clean = { ...item }
    delete clean.primaryItemTypeText
    delete clean.primaryItemTypeDiagnostics
    if (typeof item.type !== 'string') return clean
    const [abbreviation, source, ...extra] = item.type.split('|').map(normalize)
    if (!abbreviation || extra.length) {
      clean.primaryItemTypeDiagnostics = [
        { path: 'type', message: 'Unsupported primary type UID.' },
      ]
      return clean
    }
    const target = JSON.stringify([abbreviation, source || 'phb'])
    // Pinned Renderer.item legacy alias + actual Canoe|ToA/Galley|DMG producers.
    // Explicit SHP|PHB is exact. Any identifiable PHB winner, even invalid/empty, blocks this alias.
    const owner =
      abbreviation === 'shp' && !source && !byIdentity.has(target)
        ? JSON.stringify(['shp', 'dmg'])
        : target
    const rows = byIdentity.get(owner)
    if (!rows?.length) return clean
    const row = rows[0]
    const diagnostics: ItemEntryDiagnostic[] = [...(row.itemTypeDiagnostics ?? [])]
    if (rows.length > 1) diagnostics.push({ path: 'itemType', message: 'Ambiguous primary type.' })
    if (
      '_copy' in row ||
      'entriesTemplate' in row ||
      (row.entries != null && !Array.isArray(row.entries))
    )
      diagnostics.push({ path: 'itemType', message: 'Unsupported primary rules definition.' })
    let entries: unknown[] = []
    if (!diagnostics.length && Array.isArray(row.entries)) {
      const expanded = expandItemEntries(
        [{ ...clean, entries: row.entries, additionalEntries: undefined }],
        fragments,
      )[0]
      entries = expanded.entries ?? []
      diagnostics.push(...(expanded.itemEntryDiagnostics ?? []))
    }
    clean.primaryItemTypeText = {
      source: typeof row.source === 'string' && row.source.trim() ? row.source.trim() : 'PHB',
      name: typeof row.name === 'string' && row.name.trim() ? row.name : row.abbreviation,
      entries: diagnostics.length ? [UNAVAILABLE] : entries,
      ...(diagnostics.length ? { diagnostics: diagnostics.slice(0, 32) } : {}),
    }
    return clean
  })
}
