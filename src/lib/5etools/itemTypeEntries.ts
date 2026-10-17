import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type {
  Item5e,
  ItemEntry5e,
  ItemEntryDiagnostic,
  ItemTypeText5e,
  SourceBook,
} from '@/types/5etools'
import { expandItemEntries } from './itemEntries'

export interface ItemTextContext {
  allowedSources?: readonly string[]
  originSystem?: '2014' | '2024'
  sourceCatalog?: readonly SourceBook[]
}

const UNAVAILABLE = '[Supplemental item rules unavailable]'
const normalize = (value: string) => value.trim().toLowerCase()
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

/** DataUtil.itemType.unpackUid: the type's default printing is PHB, not the item's source. */
function typeIdentity(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const [abbreviation, source, ...extra] = value.split('|').map(normalize)
  if (!abbreviation || extra.length) return undefined
  return JSON.stringify([abbreviation, source || 'phb'])
}

export function itemTypeEntryIdentity(value: unknown): string | undefined {
  const row = record(value)
  const target = typeIdentity(row?.appliesTo)
  return typeof row?.source === 'string' && row.source.trim() && target
    ? JSON.stringify([normalize(row.source), target])
    : undefined
}

export function parseItemTypeEntries(data: unknown): {
  records: unknown[]
  diagnostics: ItemEntryDiagnostic[]
} {
  const value = record(data)?.itemTypeAdditionalEntries
  if (value === undefined) return { records: [], diagnostics: [] }
  if (Array.isArray(value)) return { records: value, diagnostics: [] }
  return {
    records: [],
    diagnostics: [{ path: 'itemTypeAdditionalEntries', message: 'Expected an optional array.' }],
  }
}

export function getItemTypeEntrySources(records: readonly unknown[]): string[] {
  return [
    ...new Set(
      records.flatMap((value) => {
        const source = record(value)?.source
        return typeof source === 'string' && source.trim() ? [source.trim()] : []
      }),
    ),
  ]
}

/** Retain winning duplicates and malformed identifiable overlays instead of reviving old prose. */
export function mergeItemTypeEntries(layers: readonly (readonly unknown[])[]): unknown[] {
  return layers.reduce<unknown[]>((merged, entries) => {
    const replaced = new Set(entries.map(itemTypeEntryIdentity).filter(Boolean))
    return [...merged.filter((entry) => !replaced.has(itemTypeEntryIdentity(entry))), ...entries]
  }, [])
}

function rowDiagnostics(value: unknown, path: string): ItemEntryDiagnostic[] {
  const row = record(value)
  const issues: ItemEntryDiagnostic[] = []
  if (!itemTypeEntryIdentity(value))
    issues.push({ path, message: 'Supplemental rules need an owning source and valid type UID.' })
  if (typeof row?.name !== 'string' || !row.name.trim())
    issues.push({ path: `${path}.name`, message: 'Supplemental rules need a display name.' })
  if (!Array.isArray(row?.entries))
    issues.push({ path: `${path}.entries`, message: 'Supplemental rules need an entries array.' })
  if (row?._copy) issues.push({ path, message: 'Copied supplemental definitions are unsupported.' })
  return issues
}

export function getItemTypeEntryDiagnostics(records: readonly unknown[]): ItemEntryDiagnostic[] {
  const result: ItemEntryDiagnostic[] = []
  const counts = new Map<string, number>()
  for (const [index, row] of records.entries()) {
    result.push(...rowDiagnostics(row, `itemTypeAdditionalEntries[${index}]`))
    const key = itemTypeEntryIdentity(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    if (result.length >= 32) break
  }
  for (const [key, count] of counts)
    if (count > 1)
      result.push({
        path: 'itemTypeAdditionalEntries',
        message: `Ambiguous supplemental rules: ${key}`,
      })
  return result.slice(0, 32)
}

/** Attach fresh source-qualified display metadata after raw composition/copy/text expansion. */
export function associateItemTypeEntries(
  items: readonly Item5e[],
  records: readonly unknown[],
  fragments: readonly ItemEntry5e[],
): Item5e[] {
  const groups = new Map<string, unknown[]>()
  for (const row of records) {
    const key = itemTypeEntryIdentity(row)
    if (key) groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const byTarget = new Map<string, Array<{ row: Record<string, unknown>; group: unknown[] }>>()
  for (const group of groups.values()) {
    const row = record(group[0])
    const target = typeIdentity(row?.appliesTo)
    if (row && target) byTarget.set(target, [...(byTarget.get(target) ?? []), { row, group }])
  }
  return items.map((item) => {
    const clean = { ...item }
    delete clean.itemTypeText
    const target = typeIdentity(item.type)
    const matching = target ? byTarget.get(target) : undefined
    if (!matching) return clean
    clean.itemTypeText = matching.map(({ row, group }): ItemTypeText5e => {
      const diagnostics =
        group.length > 1
          ? [{ path: 'itemTypeAdditionalEntries', message: 'Ambiguous supplemental rules.' }]
          : rowDiagnostics(row, 'itemTypeAdditionalEntries')
      let entries: unknown[] = []
      if (!diagnostics.length) {
        const expanded = expandItemEntries(
          [{ ...clean, entries: row.entries as unknown[], additionalEntries: undefined }],
          fragments,
        )[0]
        entries = expanded.entries ?? []
        diagnostics.push(...(expanded.itemEntryDiagnostics ?? []))
      }
      return {
        source: row.source as string,
        name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Additional item rules',
        entries: diagnostics.length ? [UNAVAILABLE] : entries,
        ...(diagnostics.length ? { diagnostics } : {}),
      }
    })
    return clean
  })
}

/** Project rules only; each consumer retains its existing saved-description precedence. */
export function* iterateItemRulesEntries(
  item: Item5e | undefined,
  context?: ItemTextContext,
): Generator<unknown> {
  if (!item) return
  if (Array.isArray(item.entries)) yield* item.entries
  if (Array.isArray(item.additionalEntries)) yield* item.additionalEntries
  const primary = item.primaryItemTypeText
  if (primary?.entries.length)
    yield {
      type: 'entries',
      name: `${primary.name} (${primary.source.trim()})`,
      entries: primary.entries,
    }
  const allowed =
    context?.allowedSources === undefined
      ? undefined
      : new Set(
          (context.originSystem
            ? getEffectiveSources(
                context.allowedSources,
                context.originSystem,
                context.sourceCatalog,
              )
            : context.allowedSources
          ).map(normalize),
        )
  for (const block of item.itemTypeText ?? []) {
    const source = normalize(block.source)
    if (allowed && !allowed.has(source)) continue
    const book = context?.sourceCatalog?.find((book) => normalize(book.abbreviation) === source)
    if (
      context?.originSystem &&
      !getSourceCompatibility(book ?? block.source, context.originSystem).compatible
    )
      continue
    if (block.entries.length)
      yield {
        type: 'entries',
        name: `${block.name} (${block.source.trim()})`,
        entries: block.entries,
      }
  }
}

export function getItemRulesEntries(
  item: Item5e | undefined,
  context?: ItemTextContext,
): unknown[] {
  return [...iterateItemRulesEntries(item, context)]
}
