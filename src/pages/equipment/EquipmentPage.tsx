import {
  Backpack,
  Coins,
  Diamond,
  Flask,
  MagnifyingGlass,
  Package,
  Plus,
  Scales,
  Scroll,
  Shield,
  ShieldWarning,
  Sword,
  Target,
  Trash,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { ItemSelectionModal } from '@/components/modals/ItemSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AnchoredHint,
  WorkspaceBody,
  WorkspaceDetailContent,
  WorkspacePage,
  WorkspacePaneHeader,
} from '@/components/workspace'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useEquipment } from '@/hooks/character/useEquipment'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useItemLookup, useItemPropertyLookup } from '@/hooks/data/useGameData'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { ARMOR_TYPE_MAP } from '@/lib/calculations/armorClass'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { isEquippable } from '@/lib/calculations/itemEquippable'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import { NoCharCard } from '../_shared'

const EQUIPMENT_EQUIP_HINT_ID = 'equipment-equip-toggle'
const EQUIP_AC_TOGGLE_SELECTOR = '[data-equip-ac-toggle="true"]'
const EQUIP_HINT_WIDTH = 300
type ItemCategory = 'All' | 'Weapons' | 'Armor' | 'Ammunition' | 'Gear' | 'Potions' | 'Scrolls'

const FILTER_CHIPS: ItemCategory[] = [
  'All',
  'Weapons',
  'Armor',
  'Ammunition',
  'Gear',
  'Potions',
  'Scrolls',
]

// Derived from ARMOR_TYPE_MAP so they share a single source of truth.
const ARMOR_TYPE_CODES = new Set(Object.keys(ARMOR_TYPE_MAP))
// Melee (M) and ranged (R) weapon type codes. These are 5etools item-type
// abbreviations from data/items-base.json; no standalone list exists, so they
// are declared here alongside ARMOR_TYPE_CODES for symmetry.
const WEAPON_TYPE_CODES = new Set(['M', 'R'])

function getItemCategory(item: Equipment): Exclude<ItemCategory, 'All'> {
  const t = (item.type ?? '').split('|')[0].toUpperCase()
  if (item.weaponCategory || WEAPON_TYPE_CODES.has(t)) return 'Weapons'
  if (item.armorType || ARMOR_TYPE_CODES.has(t)) return 'Armor'
  if (t === 'A') return 'Ammunition'
  if (t === 'P') return 'Potions'
  if (t === 'SC') return 'Scrolls'
  return 'Gear'
}

function itemMatchesFilter(item: Equipment, filter: ItemCategory): boolean {
  if (filter === 'All') return true
  const t = (item.type ?? '').split('|')[0].toUpperCase()
  if (filter === 'Weapons') return Boolean(item.weaponCategory) || WEAPON_TYPE_CODES.has(t)
  if (filter === 'Armor') return Boolean(item.armorType) || ARMOR_TYPE_CODES.has(t)
  if (filter === 'Ammunition') return t === 'A'
  if (filter === 'Potions') return t === 'P'
  if (filter === 'Scrolls') return t === 'SC'
  if (filter === 'Gear') return t === 'G'
  return false
}

function getRarityClass(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'uncommon':
      return 'border-green-500/40 text-green-400 bg-green-500/10'
    case 'rare':
      return 'border-blue-500/40 text-blue-400 bg-blue-500/10'
    case 'very rare':
      return 'border-purple-500/40 text-purple-400 bg-purple-500/10'
    case 'legendary':
      return 'border-orange-500/40 text-orange-400 bg-orange-500/10'
    case 'artifact':
      return 'border-red-500/40 text-red-400 bg-red-500/10'
    default:
      return 'border-border text-muted-foreground'
  }
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function getDamageSummary(item: Equipment): string | null {
  if (!item.dmg1) return null
  const damageType = item.dmgType ? ` ${toTitleCase(item.dmgType)}` : ''
  if (item.dmg2) return `${item.dmg1}${damageType} (${item.dmg2} versatile)`
  return `${item.dmg1}${damageType}`
}

function resolvePropertyLabel(tag: string, propertyByAbbr: Record<string, string>): string {
  const key = tag.trim().split('|')[0].toUpperCase()
  return propertyByAbbr[key] ?? tag
}

function getPropertySummary(
  item: Equipment,
  propertyByAbbr: Record<string, string>,
): string | null {
  if (!item.properties || item.properties.length === 0) return null
  return item.properties.map((p) => resolvePropertyLabel(p, propertyByAbbr)).join(', ')
}

export function EquipmentPage() {
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [showEquipHint, setShowEquipHint] = useState(
    () => !isHintDismissed(EQUIPMENT_EQUIP_HINT_ID),
  )
  const {
    equipment,
    totalWeight,
    carryCapacity,
    isEncumbered,
    attunedCount,
    currency,
    totalCurrencyCopper,
    addFromGameData,
    removeItem,
    updateItem,
    toggleEquip,
    toggleAttune,
    updateCurrency,
  } = useEquipment()

  const hintPosition = useAnchoredHintPosition({
    enabled: showEquipHint && equipment.length > 0,
    selector: EQUIP_AC_TOGGLE_SELECTOR,
    width: EQUIP_HINT_WIDTH,
  })

  const handleDismissEquipHint = () => {
    setShowEquipHint(false)
    setHintDismissed(EQUIPMENT_EQUIP_HINT_ID, true)
  }

  const [itemSearch, setItemSearch] = useState('')
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemCategory>('All')
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()
  const { items, itemsBase } = useFilteredGameData()
  const itemPropertyByAbbr = useItemPropertyLookup()
  const recursiveLookup = useRecursiveLookup()

  const ignoreEquipRestrictions = character?.variantRules?.ignoreEquipRestrictions ?? false
  const toggleIgnoreRestrictions = () => {
    if (!character) return
    updateCharacter(character.id, {
      variantRules: {
        ...character.variantRules,
        ignoreEquipRestrictions: !ignoreEquipRestrictions,
      },
    })
  }
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const { calculatedAC, overrideAC } = useArmorClass()
  const equipmentItems = useMemo(
    () =>
      Array.from(
        new Map(
          [...items, ...itemsBase].map((item) => [
            getEntityLookupKey(item.name, item.source),
            item,
          ]),
        ).values(),
      ),
    [items, itemsBase],
  )

  const encumbrancePct = carryCapacity > 0 ? Math.min(100, (totalWeight / carryCapacity) * 100) : 0
  const encumbranceTone =
    encumbrancePct >= 90
      ? 'bg-destructive'
      : encumbrancePct >= 60
        ? 'bg-warning'
        : encumbrancePct >= 30
          ? 'bg-green-500'
          : 'bg-blue-500'

  const filteredEquipment = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    return equipment.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false
      if (!itemMatchesFilter(item, itemTypeFilter)) return false
      return true
    })
  }, [equipment, itemSearch, itemTypeFilter])
  const selectedItem =
    equipment.find((item) => item.id === selectedItemId) ?? filteredEquipment[0] ?? null
  const selectedItemData = selectedItem
    ? itemLookup.get(
        `${selectedItem.name.trim().toLowerCase()}|${(selectedItem.source ?? 'phb').trim().toLowerCase()}`,
      )
    : undefined
  const selectedItemEntries = selectedItemData?.entries ?? []

  const handleAddItem = (item: Item5e) => {
    addFromGameData(item)
  }
  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId)
    if (selectedItemId === itemId) setSelectedItemId(null)
  }

  if (!character) {
    return <NoCharCard icon={<Backpack weight="duotone" />} noun="manage equipment" />
  }

  return (
    <WorkspacePage className="p-3">
      <AnchoredHint
        position={showEquipHint ? hintPosition : null}
        width={EQUIP_HINT_WIDTH}
        onDismiss={handleDismissEquipHint}
      >
        Toggle <strong>Equip</strong> on armor, weapons, and worn magic items to mark them active
        and applying their effect.
      </AnchoredHint>

      <WorkspaceBody className="flex overflow-hidden">
        <SplitPane
          className={cn(
            'my-0 h-full overflow-visible',
            !inventoryCollapsed && !detailCollapsed && 'gap-3',
          )}
          leftClassName={cn(
            'rounded-lg bg-workspace-pane',
            inventoryCollapsed ? 'border-0' : 'border border-border',
          )}
          rightClassName={cn(
            'rounded-lg bg-workspace-detail',
            detailCollapsed ? 'border-0' : 'border border-border',
          )}
          leftCollapsed={inventoryCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setInventoryCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader title="Inventory" className={cn(detailCollapsed && 'pr-20')}>
                <Badge variant="outline" className="h-5 px-2 text-xs">
                  {equipment.length}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Toggle equipment restrictions"
                        onClick={toggleIgnoreRestrictions}
                        className={cn(
                          'flex size-8 cursor-pointer items-center justify-center rounded-md border transition-colors',
                          ignoreEquipRestrictions
                            ? 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15'
                            : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <ShieldWarning
                          className="size-4"
                          weight={ignoreEquipRestrictions ? 'fill' : 'regular'}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {ignoreEquipRestrictions
                        ? 'Restrictions ignored — click to enforce armor slots and proficiency'
                        : 'Enforce armor slots and proficiency — click to ignore'}
                    </TooltipContent>
                  </Tooltip>
                  <Button onClick={() => setAddItemOpen(true)} size="sm" className="h-8 gap-1.5">
                    <Plus className="size-4" />
                    Add Item
                  </Button>
                </div>
              </WorkspacePaneHeader>

              <div className="shrink-0 overflow-x-auto border-b border-border bg-surface-raised/45">
                <div className="grid min-w-[820px] grid-cols-[1fr_0.8fr_0.7fr_1.8fr] divide-x divide-border">
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Scales className="size-5 text-primary" weight="fill" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        Weight
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold',
                          isEncumbered && 'text-destructive',
                        )}
                      >
                        {totalWeight.toFixed(1)} / {carryCapacity} lb
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isEncumbered ? 'Encumbered' : `${encumbrancePct.toFixed(0)}%`}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', encumbranceTone)}
                        style={{ width: `${encumbrancePct}%` }}
                      />
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Diamond className="size-5 text-violet-400" weight="fill" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        Attunement
                      </span>
                    </div>
                    <p
                      className={cn(
                        'mt-2 font-mono text-base font-semibold',
                        attunedCount >= MAX_ATTUNEMENT_SLOTS && 'text-destructive',
                      )}
                    >
                      {attunedCount} / {MAX_ATTUNEMENT_SLOTS}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      {(['first', 'second', 'third'] as const)
                        .slice(0, MAX_ATTUNEMENT_SLOTS)
                        .map((slot, index) => (
                          <span
                            key={slot}
                            className={cn(
                              'h-1.5 flex-1 rounded-full',
                              index < attunedCount
                                ? attunedCount >= MAX_ATTUNEMENT_SLOTS
                                  ? 'bg-destructive'
                                  : 'bg-violet-500'
                                : 'bg-muted',
                            )}
                          />
                        ))}
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Shield className="size-5 text-warning" weight="fill" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        Armor Class
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xl font-semibold">{calculatedAC}</p>
                    <p className="text-xs text-muted-foreground">
                      {overrideAC !== undefined ? 'Override active' : 'Equipped armor'}
                    </p>
                  </div>

                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Coins className="size-5 text-yellow-500" weight="fill" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">
                          Currency
                        </span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {(totalCurrencyCopper / 100).toFixed(2)} gp
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {(
                        [
                          ['cp', 'CP'],
                          ['sp', 'SP'],
                          ['ep', 'EP'],
                          ['gp', 'GP'],
                          ['pp', 'PP'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="min-w-0">
                          <Input
                            type="number"
                            min={0}
                            aria-label={label}
                            value={currency[key]}
                            onChange={(event) => {
                              const raw = Number.parseInt(event.target.value, 10)
                              updateCurrency(key, Number.isNaN(raw) ? 0 : raw)
                            }}
                            className="h-7 min-w-0 px-1 text-center font-mono text-xs"
                          />
                          <span className="mt-0.5 block text-center text-[10px] font-semibold text-muted-foreground">
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
                <div className="relative min-w-56 flex-1">
                  <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search inventory…"
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <div
                  className="flex shrink-0 items-stretch gap-4 overflow-x-auto self-stretch"
                  role="tablist"
                  aria-label="Inventory category"
                >
                  {FILTER_CHIPS.map((chip) => {
                    const active = itemTypeFilter === chip
                    return (
                      <button
                        key={chip}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setItemTypeFilter(chip)}
                        className={cn(
                          'relative cursor-pointer border-b-2 px-0.5 text-xs font-semibold transition-colors',
                          active
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                        )}
                      >
                        {chip}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-x-auto p-4">
                {filteredEquipment.length === 0 ? (
                  <div className="flex min-h-52 flex-col items-center justify-center text-center">
                    <Backpack className="mb-3 size-9 text-muted-foreground/35" />
                    <h3 className="text-sm font-semibold">
                      {equipment.length === 0 ? 'No equipment yet' : 'No matching equipment'}
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {equipment.length === 0
                        ? 'Add an item to begin building this character’s inventory.'
                        : 'Adjust the search or category filter to see more items.'}
                    </p>
                    {equipment.length === 0 && (
                      <Button
                        size="sm"
                        className="mt-4 gap-1.5"
                        onClick={() => setAddItemOpen(true)}
                      >
                        <Plus className="size-4" />
                        Add Item
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-w-[760px] flex-col overflow-hidden rounded-md border border-border bg-background">
                    <div className="grid shrink-0 grid-cols-[minmax(16rem,1fr)_7rem_8rem_8rem_2.5rem] items-center border-b border-border bg-surface-raised px-3 py-2 text-[length:var(--font-size-caption)] font-semibold uppercase leading-[var(--line-height-caption)] tracking-[0.08em] text-muted-foreground">
                      <span>Item</span>
                      <span className="text-center">Quantity</span>
                      <span className="text-center">Equipped</span>
                      <span className="text-center">Attuned</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                      <div className="divide-y divide-border">
                        {filteredEquipment.map((item) => {
                          const category = getItemCategory(item)
                          const ItemIcon =
                            category === 'Weapons'
                              ? Sword
                              : category === 'Armor'
                                ? Shield
                                : category === 'Ammunition'
                                  ? Target
                                  : category === 'Potions'
                                    ? Flask
                                    : category === 'Scrolls'
                                      ? Scroll
                                      : Package
                          const dmg = getDamageSummary(item)
                          const props = getPropertySummary(item, itemPropertyByAbbr)
                          const selected = selectedItem?.id === item.id

                          return (
                            <div
                              key={item.id}
                              className={cn(
                                'grid min-h-14 grid-cols-[minmax(16rem,1fr)_7rem_8rem_8rem_2.5rem] items-center px-3 text-sm transition-colors',
                                selected
                                  ? 'bg-surface-selected'
                                  : 'bg-workspace-pane hover:bg-surface-hover',
                              )}
                            >
                              <button
                                type="button"
                                aria-pressed={selected}
                                aria-label={`Inspect ${item.name}`}
                                onClick={() => {
                                  setSelectedItemId(item.id)
                                  setDetailCollapsed(false)
                                }}
                                className="flex min-w-0 cursor-default items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <ItemIcon
                                  className={cn(
                                    'size-5 shrink-0',
                                    item.equipped ? 'text-primary' : 'text-muted-foreground',
                                  )}
                                  weight={item.equipped ? 'fill' : 'regular'}
                                />
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate font-medium">{item.name}</span>
                                    {item.rarity && item.rarity !== 'none' && (
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          'h-5 shrink-0 px-1.5 text-[10px] capitalize',
                                          getRarityClass(item.rarity),
                                        )}
                                      >
                                        {item.rarity}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {[category, item.source, dmg, props]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </div>
                              </button>

                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  aria-label={`Decrease ${item.name} quantity`}
                                  onClick={() =>
                                    updateItem(item.id, {
                                      quantity: Math.max(1, item.quantity - 1),
                                    })
                                  }
                                  className="flex size-7 cursor-pointer items-center justify-center rounded border border-border text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                                  disabled={item.quantity <= 1}
                                >
                                  −
                                </button>
                                <span className="w-7 text-center font-mono text-xs">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Increase ${item.name} quantity`}
                                  onClick={() =>
                                    updateItem(item.id, { quantity: item.quantity + 1 })
                                  }
                                  className="flex size-7 cursor-pointer items-center justify-center rounded border border-border text-sm hover:bg-secondary"
                                >
                                  +
                                </button>
                              </div>

                              <div className="flex items-center justify-center">
                                {isEquippable(item) || item.equipped ? (
                                  <Switch
                                    aria-label={`Equip ${item.name}`}
                                    checked={item.equipped}
                                    onCheckedChange={() => toggleEquip(item.id)}
                                    data-equip-ac-toggle="true"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground/60">—</span>
                                )}
                              </div>

                              <div className="flex items-center justify-center">
                                {item.reqAttune ? (
                                  <Switch
                                    aria-label={`Attune ${item.name}`}
                                    checked={item.attuned ?? false}
                                    onCheckedChange={() => toggleAttune(item.id)}
                                    disabled={!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground/60">—</span>
                                )}
                              </div>

                              <div className="flex items-center justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-9 cursor-pointer p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Remove ${item.name}`}
                                  onClick={() => handleRemoveItem(item.id)}
                                >
                                  <Trash className="size-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border px-4 pb-4">
                <SourcesAccordion
                  sectionId="equipment"
                  title="Sources"
                  rows={getSourcesRowsBySection('equipment')}
                  emptyText="Add equipment to see source attribution."
                />
              </div>
            </>
          }
          right={
            <>
              <WorkspacePaneHeader title="Item details" className="pr-20" />
              <ScrollArea className="flex-1 overflow-hidden">
                <WorkspaceDetailContent className="space-y-5">
                  {selectedItem ? (
                    <>
                      <div>
                        <div className="flex items-start gap-3">
                          <Package className="mt-0.5 size-7 shrink-0 text-primary" weight="fill" />
                          <div className="min-w-0">
                            <h2 className="text-xl font-semibold">{selectedItem.name}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {[getItemCategory(selectedItem), selectedItem.source]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {selectedItem.rarity && selectedItem.rarity !== 'none' && (
                            <Badge
                              variant="outline"
                              className={cn('capitalize', getRarityClass(selectedItem.rarity))}
                            >
                              {selectedItem.rarity}
                            </Badge>
                          )}
                          {selectedItem.equipped && <Badge variant="secondary">Equipped</Badge>}
                          {selectedItem.attuned && <Badge variant="secondary">Attuned</Badge>}
                          {selectedItem.reqAttune && !selectedItem.attuned && (
                            <Badge variant="outline">Requires attunement</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background">
                        {[
                          ['Quantity', selectedItem.quantity],
                          [
                            'Weight',
                            selectedItem.weight !== undefined
                              ? `${selectedItem.weight} lb each`
                              : '—',
                          ],
                          ['Armor Class', selectedItem.ac ?? '—'],
                          ['Damage', getDamageSummary(selectedItem) ?? '—'],
                          ['Range', selectedItem.range ?? '—'],
                          [
                            'Properties',
                            getPropertySummary(selectedItem, itemPropertyByAbbr) ?? '—',
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="min-w-0 border border-border/60 px-3 py-2.5"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {label}
                            </p>
                            <p className="mt-1 break-words text-sm font-medium">{value}</p>
                          </div>
                        ))}
                      </div>

                      {selectedItemEntries.length > 0 ? (
                        <section className="border-t border-border pt-4">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Description
                          </h3>
                          <div className="prose prose-sm mt-3 max-w-none text-foreground dark:prose-invert">
                            <RenderedEntryWithTooltip
                              entry={selectedItemEntries}
                              recursiveLookup={recursiveLookup}
                            />
                          </div>
                        </section>
                      ) : selectedItem.description ? (
                        <section className="border-t border-border pt-4">
                          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Description
                          </h3>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                            {selectedItem.description}
                          </p>
                        </section>
                      ) : (
                        <p className="border-t border-border pt-4 text-sm italic text-muted-foreground">
                          No description is available for this item.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
                      Select an inventory item to inspect its details.
                    </div>
                  )}
                </WorkspaceDetailContent>
              </ScrollArea>
            </>
          }
        />
      </WorkspaceBody>

      <ItemSelectionModal
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        items={equipmentItems}
        onConfirm={(selectedItems) => {
          for (const item of selectedItems) {
            handleAddItem(item)
          }
        }}
      />
    </WorkspacePage>
  )
}
