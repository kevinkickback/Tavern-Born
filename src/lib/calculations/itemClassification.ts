import {
  ARMOR_CATEGORY_LABEL_TO_CODE,
  ITEM_TYPE_CATALOG_FALLBACKS,
  type ItemTypeFallback,
  LEGACY_ITEM_TYPE_FALLBACKS,
  type NormalizedArmorCategory,
} from '@/lib/5etools/rulesetMetadata'

export type ArmorCategory = NormalizedArmorCategory

export interface ClassifiableItem {
  type?: string | string[]
  armorType?: Exclude<ArmorCategory, 'none'>
  weaponCategory?: string
  weapon?: unknown
  armor?: unknown
  wondrous?: unknown
  tattoo?: unknown
  focus?: unknown[]
  reqAttune?: unknown
}

export interface NormalizedItemTraits {
  typeCodes: readonly string[]
  armorCategory: ArmorCategory
  isArmor: boolean
  isWeapon: boolean
  isAmmunition: boolean
  isGear: boolean
  isTool: boolean
  isPotion: boolean
  isScroll: boolean
  isConsumable: boolean
  isWondrous: boolean
  isEquippable: boolean
}

export { ARMOR_CATEGORY_LABEL_TO_CODE }

export function getItemTypeCodes(type: ClassifiableItem['type']): string[] {
  const values = Array.isArray(type) ? type : [type]
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split('|')[0].trim().toUpperCase())
    .filter(Boolean)
}

export function inferArmorCategory(label: string): ArmorCategory {
  const normalized = label.toLowerCase()
  if (normalized.includes('light armor')) return 'light'
  if (normalized.includes('medium armor')) return 'medium'
  if (normalized.includes('heavy armor')) return 'heavy'
  if (normalized.includes('shield')) return 'shield'
  return 'none'
}

export function getArmorCategoryLabel(category: ArmorCategory): string | null {
  if (category === 'light') return 'Light Armor'
  if (category === 'medium') return 'Medium Armor'
  if (category === 'heavy') return 'Heavy Armor'
  if (category === 'shield') return 'Shields'
  return null
}

export function getArmorCalculationDescription(category: ArmorCategory): string | null {
  if (category === 'light') return 'Base AC + full Dexterity modifier'
  if (category === 'medium') return 'Base AC + Dexterity modifier (maximum +2)'
  if (category === 'heavy') return 'Fixed base AC; Dexterity does not apply'
  if (category === 'shield') return 'Adds the shield’s AC bonus while equipped'
  return null
}

export function getNormalizedItemTraits(
  item: ClassifiableItem,
  itemTypeByAbbr: Readonly<Record<string, string>> = {},
): NormalizedItemTraits {
  const typeCodes = getItemTypeCodes(item.type)
  const typeLabels = typeCodes.map((code) => itemTypeByAbbr[code]?.toLowerCase() ?? '')
  const fallbacks = typeCodes
    .map((code) => ITEM_TYPE_CATALOG_FALLBACKS[code] ?? LEGACY_ITEM_TYPE_FALLBACKS[code])
    .filter((fallback): fallback is ItemTypeFallback => Boolean(fallback))
  const inferredArmor = typeLabels.map(inferArmorCategory).find((category) => category !== 'none')
  const fallbackArmor = fallbacks.find((fallback) => fallback.armorCategory)?.armorCategory
  const armorCategory = item.armorType ?? inferredArmor ?? fallbackArmor ?? 'none'
  const hasLabel = (pattern: RegExp) => typeLabels.some((label) => pattern.test(label))
  const hasFallback = (key: keyof ItemTypeFallback) =>
    fallbacks.some((fallback) => Boolean(fallback[key]))
  const isWeapon =
    Boolean(item.weaponCategory) ||
    Boolean(item.weapon) ||
    hasLabel(/weapon/) ||
    hasFallback('weapon')
  const isArmor = Boolean(item.armor) || armorCategory !== 'none'
  const isAmmunition = hasLabel(/ammunition/) || hasFallback('ammunition')
  const isTool = hasLabel(/tool|instrument|gaming set/) || hasFallback('tool')
  const isPotion = hasLabel(/potion/) || hasFallback('potion')
  const isScroll = hasLabel(/scroll/) || hasFallback('scroll')
  const isGear = hasLabel(/adventuring gear/) || hasFallback('gear')
  const isWondrous = Boolean(item.wondrous) || hasLabel(/wondrous/)
  const isEquippable =
    isArmor ||
    isWeapon ||
    isWondrous ||
    Boolean(item.tattoo) ||
    Boolean(item.focus?.length) ||
    Boolean(item.reqAttune) ||
    hasFallback('equippable')

  return {
    typeCodes,
    armorCategory,
    isArmor,
    isWeapon,
    isAmmunition,
    isGear,
    isTool,
    isPotion,
    isScroll,
    isConsumable: isPotion || isScroll,
    isWondrous,
    isEquippable,
  }
}

export function validateItemTypeFallbacks(itemTypeByAbbr: Record<string, string>): void {
  for (const code of Object.keys(ITEM_TYPE_CATALOG_FALLBACKS)) {
    if (!itemTypeByAbbr[code]) {
      console.warn(
        `[itemClassification] catalog fallback code "${code}" is absent from parsed item types; verify the versioned metadata adapter.`,
      )
    }
  }
}
