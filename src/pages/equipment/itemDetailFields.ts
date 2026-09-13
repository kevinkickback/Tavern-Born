import { getArmorCategory } from '@/lib/calculations/armorClass'
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

const ARMOR_TYPE_CODES = new Set(['LA', 'MA', 'HA', 'S'])
const WEAPON_TYPE_CODES = new Set(['M', 'R'])

function getTypeCode(item: Equipment): string {
  return (item.type ?? '').split('|')[0].toUpperCase()
}

export function getItemCategory(item: Equipment): Exclude<ItemCategory, 'All'> {
  const typeCode = getTypeCode(item)
  if (item.weaponCategory || WEAPON_TYPE_CODES.has(typeCode)) return 'Weapons'
  if (item.armorType || ARMOR_TYPE_CODES.has(typeCode)) return 'Armor'
  if (typeCode === 'A') return 'Ammunition'
  if (typeCode === 'P') return 'Potions'
  if (typeCode === 'SC') return 'Scrolls'
  return 'Gear'
}

export function itemMatchesFilter(item: Equipment, filter: ItemCategory): boolean {
  if (filter === 'All') return true
  return getItemCategory(item) === filter
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

function formatItemValue(value: number): string {
  if (value >= 100) {
    const gp = Math.floor(value / 100)
    const remainingCopper = value % 100
    if (remainingCopper === 0) return `${gp} gp`
    if (remainingCopper % 10 === 0) return `${gp} gp ${remainingCopper / 10} sp`
    return `${gp} gp ${remainingCopper} cp`
  }
  if (value >= 10 && value % 10 === 0) return `${value / 10} sp`
  return `${value} cp`
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
  if (value !== undefined) fields.push({ label: 'Value', value: formatItemValue(value) })

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
