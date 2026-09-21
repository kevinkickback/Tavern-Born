import type { Item5e } from '@/types/5etools'
import { DataFilter } from './filters'

interface CharacterItemFilterOptions {
  allowedSources?: string[]
  originSystem?: '2014' | '2024'
  suppressedKeys?: Set<string>
}

function isPublicCoreItem(item: Item5e, originSystem: '2014' | '2024'): boolean {
  return originSystem === '2024'
    ? item.source.toUpperCase() === 'XDMG' && Boolean(item.srd52 || item.basicRules2024)
    : item.source.toUpperCase() === 'DMG' && Boolean(item.srd || item.basicRules)
}

/**
 * Applies character source settings while retaining the matching ruleset's public SRD items.
 * Their definitions keep their DMG/XDMG identities even though the Included SRD remains the base
 * catalog when additional content is configured.
 */
export function filterCharacterItems(
  items: Item5e[],
  { allowedSources, originSystem, suppressedKeys }: CharacterItemFilterOptions,
): Item5e[] {
  const unsuppressedItems = DataFilter.filterItems(items, { suppressedKeys })
  if (!allowedSources || allowedSources.length === 0) return unsuppressedItems

  const allowed = new Set(allowedSources.map((source) => source.toUpperCase()))
  return unsuppressedItems.filter(
    (item) =>
      allowed.has(item.source.toUpperCase()) ||
      (originSystem ? isPublicCoreItem(item, originSystem) : false),
  )
}
