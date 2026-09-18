import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import type { Item5e } from '@/types/5etools'
import { DataFilter } from './filters'

interface CharacterItemFilterOptions {
  allowedSources?: string[]
  originSystem?: '2014' | '2024'
  itemTypeByAbbr?: Readonly<Record<string, string>>
  suppressedKeys?: Set<string>
}

function isCoreRulesetConsumable(
  item: Item5e,
  originSystem: '2014' | '2024',
  itemTypeByAbbr: Readonly<Record<string, string>>,
): boolean {
  const isMatchingCoreItem =
    originSystem === '2024'
      ? item.source.toUpperCase() === 'XDMG' && Boolean(item.srd52 || item.basicRules2024)
      : item.source.toUpperCase() === 'DMG' && Boolean(item.srd || item.basicRules)

  if (!isMatchingCoreItem) return false

  const traits = getNormalizedItemTraits(item, itemTypeByAbbr)
  return traits.isPotion || traits.isScroll
}

/**
 * Applies character source settings while retaining the ruleset's public core potions and scrolls.
 * Their definitions live in the DMG catalog even though they are routine player inventory.
 */
export function filterCharacterItems(
  items: Item5e[],
  { allowedSources, originSystem, itemTypeByAbbr = {}, suppressedKeys }: CharacterItemFilterOptions,
): Item5e[] {
  const unsuppressedItems = DataFilter.filterItems(items, { suppressedKeys })
  if (!allowedSources || allowedSources.length === 0) return unsuppressedItems

  const allowed = new Set(allowedSources.map((source) => source.toUpperCase()))
  return unsuppressedItems.filter(
    (item) =>
      allowed.has(item.source.toUpperCase()) ||
      (originSystem ? isCoreRulesetConsumable(item, originSystem, itemTypeByAbbr) : false),
  )
}
