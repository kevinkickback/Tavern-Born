import type { Item5e } from '@/types/5etools'

/** Restore own collection authority after copies/_mod, independently of inherited presentation. */
export function preserveStartingItemCategories(
  raw: readonly Item5e[],
  resolved: readonly Item5e[],
): Item5e[] {
  return resolved.map((item, index) => ({
    ...item,
    startingEquipmentCategory:
      raw[index]?.startingEquipmentCategory === 'Basic' ? 'Basic' : 'Other',
  }))
}

/** Data-only adaptation of Renderer.item.isMundane, pinned 5etools b90615835361. */
export function isMundaneStartingItem(item: Item5e): boolean {
  return (
    item.startingEquipmentCategory === 'Basic' ||
    item.rarity === 'none' ||
    item.rarity === 'unknown'
  )
}
