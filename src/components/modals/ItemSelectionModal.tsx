import { memo, useMemo } from 'react'
import {
  type ActiveFilters,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Item5e } from '@/types/5etools'

export interface ItemSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  items: Item5e[]
  onConfirm: (items: Item5e[]) => void
}

type ItemCategory = 'weapons' | 'armor' | 'ammunition' | 'adventuring-gear' | 'potions' | 'scrolls'

const TYPE_OPTIONS: Array<{ value: ItemCategory; label: string }> = [
  { value: 'weapons', label: 'Weapons' },
  { value: 'armor', label: 'Armor' },
  { value: 'ammunition', label: 'Ammunition' },
  { value: 'adventuring-gear', label: 'Adventuring Gear' },
  { value: 'potions', label: 'Potions' },
  { value: 'scrolls', label: 'Scrolls' },
]

/**
 * Canonical rarity ordering used to sort dynamically derived rarity filter options.
 * Rarities of 'none' (mundane items) are intentionally omitted — they are filtered
 * by the "no rarity filter active" default rather than as a selectable tier.
 */
const RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
  'varies',
  'unknown',
  'unknown (magic)',
] as const

const PROPERTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'magic', label: 'Magic' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'cursed', label: 'Cursed' },
]

const ITEM_PROPERTY_LABELS: Record<string, string> = {
  A: 'Ammunition',
  AF: 'Ammunition (Firearms)',
  BF: 'Burst Fire',
  F: 'Finesse',
  H: 'Heavy',
  L: 'Light',
  LD: 'Loading',
  R: 'Reach',
  RLD: 'Reload',
  S: 'Special',
  T: 'Thrown',
  '2H': 'Two-Handed',
  V: 'Versatile',
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

function getItemDescription(item: Item5e): string {
  const entries = Array.isArray(item.entries) ? item.entries : []
  if (entries.length === 0) return ''

  const rendered = renderEntryCached(entries[0])
  const plain = toPlainText(rendered)
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain
}

function getPropertyLabel(tag: string): string {
  // Strip optional source suffix (e.g. "A|XPHB" → "A") before map lookup.
  const key = tag.trim().split('|')[0].toUpperCase()
  return ITEM_PROPERTY_LABELS[key] ?? tag
}

function getItemTypeCodes(item: Item5e): string[] {
  const type = item.type
  if (Array.isArray(type)) {
    return type.map((t) => String(t).split('|')[0].toUpperCase())
  }
  return [
    String(type ?? '')
      .split('|')[0]
      .toUpperCase(),
  ].filter(Boolean)
}

function getItemCategories(item: Item5e): Set<ItemCategory> {
  const categories = new Set<ItemCategory>()
  const typeCodes = getItemTypeCodes(item)

  const isWeapon =
    Boolean(item.weaponCategory) ||
    Boolean((item as { weapon?: unknown }).weapon) ||
    typeCodes.some((code) => code === 'M' || code === 'R')

  if (isWeapon) categories.add('weapons')

  if (
    Boolean((item as { armor?: unknown }).armor) ||
    typeCodes.some((code) => code === 'LA' || code === 'MA' || code === 'HA' || code === 'S')
  ) {
    categories.add('armor')
  }

  if (typeCodes.includes('A')) categories.add('ammunition')
  if (typeCodes.includes('G')) categories.add('adventuring-gear')
  if (typeCodes.includes('P')) categories.add('potions')
  if (typeCodes.includes('SC')) categories.add('scrolls')

  return categories
}

function getPrimaryCategoryLabel(item: Item5e): string {
  const categories = getItemCategories(item)
  const ordered: ItemCategory[] = [
    'weapons',
    'armor',
    'ammunition',
    'adventuring-gear',
    'potions',
    'scrolls',
  ]

  const primary = ordered.find((category) => categories.has(category))
  return TYPE_OPTIONS.find((option) => option.value === primary)?.label ?? 'Item'
}

function matchItem(item: Item5e, search: string, activeFilters: ActiveFilters): boolean {
  if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
    return false
  }

  const categories = getItemCategories(item)
  if (categories.size === 0) {
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
  const raritySet = activeFilters.rarity
  if (raritySet && raritySet.size > 0) {
    // Items with rarity 'none' (mundane) are excluded when any rarity filter is active.
    if (!rarity || rarity === 'none') return false
    if (!raritySet.has(rarity)) return false
  }

  const propertySet = activeFilters.property
  if (propertySet && propertySet.size > 0) {
    const typeCodes = getItemTypeCodes(item)
    const hasAnyMatch = Array.from(propertySet).some((property) => {
      if (property === 'magic') {
        return Boolean(item.rarity && item.rarity.toLowerCase() !== 'none')
      }
      if (property === 'consumable') {
        return typeCodes.includes('P') || typeCodes.includes('SC') || typeCodes.includes('$')
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
  const description = getItemDescription(item)

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
        <Badge variant="outline">{getPrimaryCategoryLabel(item)}</Badge>
        {item.rarity && item.rarity !== 'none' && (
          <Badge variant="secondary" className="capitalize">
            {item.rarity}
          </Badge>
        )}
        {properties.slice(0, 6).map((prop) => (
          <Badge
            key={prop}
            variant="outline"
            className={cn('text-xs px-1.5 py-0 h-5')}
            title={getPropertyLabel(prop)}
          >
            {getPropertyLabel(prop)}
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
}: ItemSelectionModalProps) {
  const filteredItems = useMemo(
    () => items.filter((item) => getItemCategories(item).size > 0),
    [items],
  )

  // Derive rarity filter options from the actual items in the prop, ordered by RARITY_ORDER.
  // This ensures options stay in sync with the data without manual maintenance.
  const rarityOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const item of filteredItems) {
      const r = (item.rarity ?? '').toLowerCase()
      if (r && r !== 'none') seen.add(r)
    }
    return RARITY_ORDER.filter((r) => seen.has(r)).map((r) => ({
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
      options: TYPE_OPTIONS,
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
      matchItem={(item, search, activeFilters) => matchItem(item, search, activeFilters)}
      filterSections={filterSections}
      onConfirm={(_ids, selectedItems) => onConfirm(selectedItems)}
    />
  )
}
