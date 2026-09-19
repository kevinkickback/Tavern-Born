import { getArmorCategory } from '@/lib/calculations/armorClass'
import { formatCopperValue } from '@/lib/calculations/currency'
import {
  getArmorCategoryLabel,
  getNormalizedItemTraits,
  type NormalizedItemTraits,
} from '@/lib/calculations/itemClassification'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'

export type ItemCategory =
  | 'All'
  | 'Weapons'
  | 'Armor'
  | 'Ammunition'
  | 'Gear'
  | 'Potions'
  | 'Scrolls'

export interface ItemDetailField {
  label: string
  value: string | number
}

function getItemCategoryFromTraits(traits: NormalizedItemTraits): Exclude<ItemCategory, 'All'> {
  if (traits.isWeapon) return 'Weapons'
  if (traits.isArmor) return 'Armor'
  if (traits.isAmmunition) return 'Ammunition'
  if (traits.isPotion) return 'Potions'
  if (traits.isScroll) return 'Scrolls'
  return 'Gear'
}

export function getInventoryItemClassification(item: Equipment): {
  category: Exclude<ItemCategory, 'All'>
  label: string
} {
  const traits = getNormalizedItemTraits(item)
  const category = getItemCategoryFromTraits(traits)
  const label =
    category === 'Armor' ? (getArmorCategoryLabel(traits.armorCategory) ?? category) : category
  return { category, label }
}

export function getItemCategory(item: Equipment): Exclude<ItemCategory, 'All'> {
  return getInventoryItemClassification(item).category
}

export function itemMatchesFilter(item: Equipment, filter: ItemCategory): boolean {
  if (filter === 'All') return true
  return getItemCategory(item) === filter
}

export function getInventoryItemTypeLabel(item: Equipment): Exclude<ItemCategory, 'All'> | string {
  return getInventoryItemClassification(item).label
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function getDamageSummary(item: Equipment, itemData?: Item5e): string | null {
  const primaryDamage = item.dmg1 ?? itemData?.dmg1
  if (!primaryDamage) return null

  const damageTypeKey = item.dmgType ?? itemData?.dmgType
  const damageType = damageTypeKey ? ` ${toTitleCase(damageTypeKey)}` : ''
  const versatileDamage = item.dmg2 ?? itemData?.dmg2
  if (versatileDamage) return `${primaryDamage}${damageType} (${versatileDamage} versatile)`
  return `${primaryDamage}${damageType}`
}

function resolvePropertyLabel(tag: string, propertyByAbbr: Record<string, string>): string {
  const key = tag.trim().split('|')[0].toUpperCase()
  return propertyByAbbr[key] ?? tag
}

export function getPropertySummary(
  item: Equipment,
  propertyByAbbr: Record<string, string>,
  itemData?: Item5e,
): string | null {
  const properties = item.properties ?? itemData?.property
  if (!properties?.length) return null
  return properties.map((property) => resolvePropertyLabel(property, propertyByAbbr)).join(', ')
}

function getArmorTypeLabel(item: Equipment): string | null {
  const armorType = getArmorCategory(item)
  if (armorType === 'none') return null
  if (armorType === 'shield') return 'Shield'
  return `${toTitleCase(armorType)} Armor`
}

export function buildItemDetailFields(
  item: Equipment,
  itemData: Item5e | undefined,
  propertyByAbbr: Record<string, string>,
): ItemDetailField[] {
  const category = getItemCategory(item)
  const fields: ItemDetailField[] = [{ label: 'Quantity', value: item.quantity }]
  const weight = item.weight ?? itemData?.weight
  const value = item.value ?? itemData?.value
  const armorClass = item.ac ?? itemData?.ac
  const damage = getDamageSummary(item, itemData)
  const range = item.range ?? itemData?.range
  const properties = getPropertySummary(item, propertyByAbbr, itemData)

  if (weight !== undefined) fields.push({ label: 'Weight', value: `${weight} lb each` })
  if (value !== undefined) fields.push({ label: 'Value', value: formatCopperValue(value) })

  if (category === 'Armor') {
    const armorType = getArmorTypeLabel(item)
    if (armorType) fields.push({ label: 'Armor Type', value: armorType })
  }

  if (armorClass !== undefined) fields.push({ label: 'Armor Class', value: armorClass })

  if (category === 'Armor' && itemData?.strength) {
    fields.push({ label: 'Strength', value: `${itemData.strength} required` })
  }
  if (category === 'Armor' && itemData?.stealth) {
    fields.push({ label: 'Stealth', value: 'Disadvantage' })
  }

  if (damage) fields.push({ label: 'Damage', value: damage })
  if (range) fields.push({ label: 'Range', value: range })
  if (properties) fields.push({ label: 'Properties', value: properties })

  return fields
}
