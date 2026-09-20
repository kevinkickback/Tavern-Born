import { memo, useMemo } from 'react'
import {
  type ActiveFilters,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { useItemPropertyLookup, useItemTypeLookup } from '@/hooks/data/useGameData'
import { RARITY_COLORS, RARITY_ORDER } from '@/lib/5etools/constants'
import {
  getArmorCategoryLabel,
  getNormalizedItemTraits,
} from '@/lib/calculations/itemClassification'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Item5e } from '@/types/5etools'

export interface ItemSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  items: Item5e[]
  onConfirm: (items: Item5e[]) => void
  onManageSources?: () => void
}

export type ItemCategory =
  | 'weapons'
  | 'armor'
  | 'ammunition'
  | 'adventuring-gear'
  | 'tools'
  | 'wondrous'
  | 'potions'
  | 'scrolls'
  | 'other'

const CORE_TYPE_OPTIONS: Array<{ value: ItemCategory; label: string }> = [
  { value: 'weapons', label: 'Weapons' },
  { value: 'armor', label: 'Armor' },
  { value: 'ammunition', label: 'Ammunition' },
  { value: 'adventuring-gear', label: 'Adventuring Gear' },
  { value: 'tools', label: 'Tools & Instruments' },
  { value: 'wondrous', label: 'Wondrous Items' },
  { value: 'potions', label: 'Potions' },
  { value: 'scrolls', label: 'Scrolls' },
]

const PROPERTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'attunement', label: 'Attunement' },
  { value: 'magic', label: 'Magic' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'cursed', label: 'Cursed' },
]

function getPropertyLabel(tag: string, propertyByAbbr: Record<string, string>): string {
  const key = tag.trim().split('|')[0].toUpperCase()
  return propertyByAbbr[key] ?? tag
}

function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function getArmorStatSummary(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string {
  const armorCategory = getNormalizedItemTraits(item, itemTypeByAbbr).armorCategory
  const parts: string[] = []

  if (armorCategory === 'shield' && item.ac !== undefined) {
    parts.push(`Shield — +${item.ac} to AC while wielded.`)
  } else if (armorCategory === 'light' && item.ac !== undefined) {
    parts.push(`Light Armor — AC ${item.ac} + Dex modifier.`)
  } else if (armorCategory === 'medium' && item.ac !== undefined) {
    parts.push(`Medium Armor — AC ${item.ac} + Dex modifier (max +2).`)
  } else if (armorCategory === 'heavy' && item.ac !== undefined) {
    parts.push(`Heavy Armor — AC ${item.ac}.`)
  }

  if (item.strength) parts.push(`Requires Strength ${item.strength}.`)
  if (item.stealth) parts.push('Disadvantage on Stealth checks.')

  return parts.join(' ')
}

function getItemDescription(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string {
  const entries = Array.isArray(item.entries) ? item.entries : []
  if (entries.length > 0) {
    const rendered = renderEntryCached(entries[0])
    const plain = toPlainText(rendered)
    return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain
  }

  return getArmorStatSummary(item, itemTypeByAbbr)
}

export function getItemCategories(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): Set<ItemCategory> {
  const categories = new Set<ItemCategory>()
  const traits = getNormalizedItemTraits(item, itemTypeByAbbr)

  if (traits.isWeapon) categories.add('weapons')
  if (traits.isArmor) categories.add('armor')
  if (traits.isAmmunition) categories.add('ammunition')
  if (traits.isGear) categories.add('adventuring-gear')
  if (traits.isTool) categories.add('tools')
  if (traits.isWondrous) categories.add('wondrous')
  if (traits.isPotion) categories.add('potions')
  if (traits.isScroll) categories.add('scrolls')
  if (categories.size === 0) categories.add('other')

  return categories
}

function getPrimaryCategoryLabel(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string {
  const categories = getItemCategories(item, itemTypeByAbbr)
  const ordered: ItemCategory[] = [
    'weapons',
    'armor',
    'ammunition',
    'adventuring-gear',
    'tools',
    'wondrous',
    'potions',
    'scrolls',
    'other',
  ]

  const primary = ordered.find((category) => categories.has(category))
  if (primary === 'other') {
    const labels = getNormalizedItemTraits(item, itemTypeByAbbr)
      .typeCodes.map((code) => itemTypeByAbbr[code])
      .filter((label): label is string => Boolean(label))
    return labels.join(', ') || 'Other'
  }
  return CORE_TYPE_OPTIONS.find((option) => option.value === primary)?.label ?? 'Other'
}

function matchItem(
  item: Item5e,
  search: string,
  activeFilters: ActiveFilters,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): boolean {
  if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
    return false
  }

  const categories = getItemCategories(item, itemTypeByAbbr)
  if ((item.rarity ?? '').toLowerCase() === 'varies') {
    return false
  }

  const typeSet = activeFilters.type
  if (typeSet && typeSet.size > 0) {
    const hasTypeMatch = Array.from(typeSet).some((type) => categories.has(type as ItemCategory))
    if (!hasTypeMatch) {
      return false
    }
  }

  const rarity = (item.rarity ?? '').toLowerCase()
  const normalizedRarity = rarity === 'unknown (magic)' ? 'unknown' : rarity
  const raritySet = activeFilters.rarity
  if (raritySet && raritySet.size > 0) {
    if (!normalizedRarity || normalizedRarity === 'none') return false
    if (!raritySet.has(normalizedRarity)) return false
  }

  const propertySet = activeFilters.property
  if (propertySet && propertySet.size > 0) {
    const traits = getNormalizedItemTraits(item, itemTypeByAbbr)
    const hasAnyMatch = Array.from(propertySet).some((property) => {
      if (property === 'attunement') {
        return Boolean(item.reqAttune)
      }
      if (property === 'magic') {
        return Boolean(item.rarity && item.rarity.toLowerCase() !== 'none')
      }
      if (property === 'consumable') {
        return traits.isConsumable || traits.typeCodes.includes('$')
      }
      if (property === 'cursed') {
        return Boolean((item as { curse?: unknown }).curse)
      }
      return false
    })

    if (!hasAnyMatch) {
      return false
    }
  }

  return true
}

interface ItemCardProps {
  item: Item5e
  isSelected: boolean
}

const ItemCard = memo(function ItemCard({ item, isSelected }: ItemCardProps) {
  const properties = item.property ?? []
  const itemTypeByAbbr = useItemTypeLookup()
  const description = getItemDescription(item, itemTypeByAbbr)
  const normalizedRarity =
    item.rarity && item.rarity.toLowerCase() === 'unknown (magic)' ? 'unknown' : (item.rarity ?? '')
  const rarityColorClass = RARITY_COLORS[normalizedRarity.toLowerCase()] ?? ''
  const itemPropertyByAbbr = useItemPropertyLookup()
  const armorCategoryLabel = getArmorCategoryLabel(
    getNormalizedItemTraits(item, itemTypeByAbbr).armorCategory,
  )
  const primaryCategoryLabel = getPrimaryCategoryLabel(item, itemTypeByAbbr)

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-semibold text-sm leading-tight">{item.name}</span>
        <div className="flex gap-1 flex-wrap flex-shrink-0">
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">✓</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
        {!armorCategoryLabel && <Badge variant="outline">{primaryCategoryLabel}</Badge>}
        {armorCategoryLabel && <Badge variant="outline">{armorCategoryLabel}</Badge>}
        {normalizedRarity && normalizedRarity.toLowerCase() !== 'none' && (
          <Badge
            variant="outline"
            className={cn('capitalize text-xs px-1.5 py-0 h-5', rarityColorClass)}
          >
            {normalizedRarity}
          </Badge>
        )}
        {item.reqAttune && (
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0 h-5 bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-400"
            title={
              typeof item.reqAttune === 'string'
                ? `Requires attunement ${item.reqAttune}`
                : undefined
            }
          >
            Attunement
          </Badge>
        )}
        {properties.slice(0, 6).map((prop) => (
          <Badge
            key={prop}
            variant="outline"
            className={cn(
              'text-xs px-1.5 py-0 h-5',
              'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-400',
            )}
            title={getPropertyLabel(prop, itemPropertyByAbbr)}
          >
            {getPropertyLabel(prop, itemPropertyByAbbr)}
          </Badge>
        ))}
        {properties.length > 6 && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
            +{properties.length - 6}
          </Badge>
        )}
        {item.weight !== undefined && (
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
            {item.weight} lb
          </Badge>
        )}
        <Badge variant="outline" title="Source">
          {item.source}
        </Badge>
      </div>
      {description && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {description}
        </p>
      )}
    </div>
  )
})

export function ItemSelectionModal({
  open,
  onOpenChange,
  title = 'Add Item',
  items,
  onConfirm,
  onManageSources,
}: ItemSelectionModalProps) {
  const itemTypeByAbbr = useItemTypeLookup()
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (Array.isArray((item as { items?: unknown }).items)) return false
        return true
      }),
    [items],
  )

  const typeOptions = useMemo(() => {
    const hasOther = filteredItems.some((item) =>
      getItemCategories(item, itemTypeByAbbr).has('other'),
    )
    return hasOther
      ? [...CORE_TYPE_OPTIONS, { value: 'other' as const, label: 'Other' }]
      : CORE_TYPE_OPTIONS
  }, [filteredItems, itemTypeByAbbr])

  const rarityOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const item of filteredItems) {
      const r = (item.rarity ?? '').toLowerCase()
      if (r && r !== 'none') seen.add(r === 'unknown (magic)' ? 'unknown' : r)
    }
    const rarityRank = new Map<string, number>(RARITY_ORDER.map((rarity, index) => [rarity, index]))
    return [...seen]
      .sort((left, right) => {
        const leftRank = rarityRank.get(left) ?? Number.POSITIVE_INFINITY
        const rightRank = rarityRank.get(right) ?? Number.POSITIVE_INFINITY
        return leftRank - rightRank || left.localeCompare(right)
      })
      .map((r) => ({
        value: r,
        label: r
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
      }))
  }, [filteredItems])

  const filterSections: FilterSection[] = [
    {
      key: 'type',
      label: 'Type',
      type: 'checkboxes',
      columns: 1,
      options: typeOptions,
    },
    {
      key: 'rarity',
      label: 'Rarity',
      type: 'checkboxes',
      columns: 1,
      options: rarityOptions,
    },
    {
      key: 'property',
      label: 'Properties',
      type: 'checkboxes',
      columns: 1,
      options: PROPERTY_OPTIONS,
    },
  ]

  return (
    <SelectionModal<Item5e>
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      items={filteredItems}
      getItemId={(item) => `${item.name}|${item.source ?? ''}`}
      renderCard={(item, isSelected) => <ItemCard item={item} isSelected={isSelected} />}
      matchItem={(item, search, activeFilters) =>
        matchItem(item, search, activeFilters, itemTypeByAbbr)
      }
      filterSections={filterSections}
      selectionHint={
        onManageSources ? (
          <button
            type="button"
            className="cursor-pointer font-semibold text-primary underline-offset-2 hover:underline"
            onClick={onManageSources}
          >
            Manage additional content
          </button>
        ) : undefined
      }
      onConfirm={(_ids, selectedItems) => onConfirm(selectedItems)}
    />
  )
}
