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
  return [...new Set(itemLookup.values())]
    .filter((item) => item.name === name && (!source || item.source === source))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.name.localeCompare(right.name),
    )[0]
}
