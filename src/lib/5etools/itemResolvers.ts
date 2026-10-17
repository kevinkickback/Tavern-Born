import type { Item5e } from '@/types/5etools'

interface ItemReference {
  name?: string
  source?: string
}

/** Resolves exact source-qualified item references with a deterministic legacy name fallback. */
export function resolveItemReference(
  reference: ItemReference,
  itemLookup: ReadonlyMap<string, Item5e> | undefined,
): Item5e | undefined {
  const name = reference.name?.trim()
  if (!name || !itemLookup) return undefined
  const source = reference.source?.trim()
  let selected: Item5e | undefined
  for (const item of itemLookup.values()) {
    if (item.name !== name) continue
    if (source) {
      if (item.source === source) return item
    } else if (!selected || item.source.localeCompare(selected.source) < 0) {
      selected = item
    }
  }
  return selected
}

/** Resolves a synchronous projection's references in one pass over the supplied map. */
export function resolveItemReferences(
  references: readonly ItemReference[],
  itemLookup: ReadonlyMap<string, Item5e> | undefined,
): Array<Item5e | undefined> {
  if (references.length === 1) return [resolveItemReference(references[0], itemLookup)]
  const names = new Set(references.map((reference) => reference.name?.trim()).filter(Boolean))
  if (!itemLookup || names.size === 0) return references.map(() => undefined)

  const exact = new Map<string, Map<string, Item5e>>()
  const fallback = new Map<string, Item5e>()
  for (const item of itemLookup.values()) {
    if (!names.has(item.name)) continue
    let printings = exact.get(item.name)
    if (!printings) {
      printings = new Map()
      exact.set(item.name, printings)
    }
    if (!printings.has(item.source)) printings.set(item.source, item)
    const previous = fallback.get(item.name)
    if (!previous || item.source.localeCompare(previous.source) < 0) {
      fallback.set(item.name, item)
    }
  }

  return references.map((reference) => {
    const name = reference.name?.trim()
    if (!name) return undefined
    const source = reference.source?.trim()
    return source ? exact.get(name)?.get(source) : fallback.get(name)
  })
}
