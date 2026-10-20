import type { Item5e } from '@/types/5etools'

interface ItemReference {
  name?: string
  source?: string
}

/** Catalog rules require the item's explicit name and printing. */
export function resolveItemReference(
  reference: ItemReference,
  itemLookup: ReadonlyMap<string, Item5e> | undefined,
): Item5e | undefined {
  const name = reference.name?.trim()
  const source = reference.source?.trim()
  if (!name || !source || !itemLookup) return undefined
  for (const item of itemLookup.values()) {
    if (item.name === name && item.source === source) return item
  }
  return undefined
}

/** Resolves a synchronous projection's references in one pass over the supplied map. */
export function resolveItemReferences(
  references: readonly ItemReference[],
  itemLookup: ReadonlyMap<string, Item5e> | undefined,
): Array<Item5e | undefined> {
  if (references.length === 1) return [resolveItemReference(references[0], itemLookup)]
  const names = new Set(
    references
      .filter((reference) => reference.source?.trim())
      .map((reference) => reference.name?.trim())
      .filter(Boolean),
  )
  if (!itemLookup || names.size === 0) return references.map(() => undefined)

  const exact = new Map<string, Map<string, Item5e>>()
  for (const item of itemLookup.values()) {
    if (!names.has(item.name)) continue
    let printings = exact.get(item.name)
    if (!printings) {
      printings = new Map()
      exact.set(item.name, printings)
    }
    if (!printings.has(item.source)) printings.set(item.source, item)
  }

  return references.map((reference) => {
    const name = reference.name?.trim()
    const source = reference.source?.trim()
    return name && source ? exact.get(name)?.get(source) : undefined
  })
}
