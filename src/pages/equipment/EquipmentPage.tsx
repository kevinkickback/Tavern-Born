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
  Sword,
  Target,
  Trash,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { ItemSelectionModal } from '@/components/modals/ItemSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useEquipment } from '@/hooks/character/useEquipment'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import { NoCharCard } from '../_shared'

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

const ARMOR_TYPE_CODES = new Set(['LA', 'MA', 'HA', 'S'])
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

function getPropertySummary(item: Equipment): string | null {
  if (!item.properties || item.properties.length === 0) return null
  return item.properties.join(', ')
}

export function EquipmentPage() {
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemCategory>('All')
  const character = useCharacterStore((s) => s.activeCharacter)
  const { items, itemsBase } = useFilteredGameData()
  const { applyManualEquipmentGrant, removeEquipmentProvenance, getSourcesRowsBySection } =
    useProvenance()
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
  const { calculatedAC, overrideAC } = useArmorClass()
  const equipmentItems = useMemo(() => {
    const merged = new Map<string, Item5e>()
    for (const item of items as Item5e[]) {
      const key = `${item.name}|${item.source ?? ''}`
      merged.set(key, item)
    }
    for (const item of (itemsBase ?? []) as Item5e[]) {
      const key = `${item.name}|${item.source ?? ''}`
      if (!merged.has(key)) merged.set(key, item)
    }
    return Array.from(merged.values())
  }, [items, itemsBase])

  const encumbrancePct = carryCapacity > 0 ? Math.min(100, (totalWeight / carryCapacity) * 100) : 0
  const encumbranceTone =
    encumbrancePct >= 100 ? 'bg-destructive' : encumbrancePct >= 75 ? 'bg-warning' : 'bg-accent'

  const filteredEquipment = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    return equipment.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false
      if (!itemMatchesFilter(item, itemTypeFilter)) return false
      return true
    })
  }, [equipment, itemSearch, itemTypeFilter])

  const handleAddItem = (item: Item5e) => {
    addFromGameData(item)
    applyManualEquipmentGrant(item.name)
  }
  const handleRemoveItem = (itemId: string) => {
    const existing = equipment.find((item) => item.id === itemId)
    removeItem(itemId)
    if (existing) removeEquipmentProvenance(existing.name)
  }

  if (!character) {
    return <NoCharCard icon={<Backpack weight="duotone" />} noun="manage equipment" />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header band */}
      <div className="px-6 py-5 page-header-band mb-6 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Backpack className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Equipment</h1>
              <p className="text-sm text-muted-foreground">
                Manage your inventory and carried equipment
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="px-6 mb-6 shrink-0">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Weight tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm">
                <Scales className="h-5 w-5 text-primary-foreground" weight="bold" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Weight
                </p>
                <p
                  className={cn(
                    'text-sm font-bold font-mono',
                    isEncumbered ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {totalWeight.toFixed(1)} / {carryCapacity} lb
                </p>
              </div>
            </div>
            <div className="px-4 pb-3">
              <div className="bg-primary/20 relative h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={cn('h-full transition-all rounded-full', encumbranceTone)}
                  style={{ width: `${encumbrancePct}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-1 text-right">
                {isEncumbered ? 'Encumbered' : `${encumbrancePct.toFixed(0)}%`}
              </p>
            </div>
          </div>

          {/* Attunement tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Diamond className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Attunement
                </p>
                <p
                  className={cn(
                    'text-sm font-bold font-mono',
                    attunedCount >= MAX_ATTUNEMENT_SLOTS ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {attunedCount} / {MAX_ATTUNEMENT_SLOTS}
                </p>
              </div>
            </div>
            <div className="px-4 pb-3">
              <div className="flex gap-1.5">
                {(['first', 'second', 'third'] as const)
                  .slice(0, MAX_ATTUNEMENT_SLOTS)
                  .map((label, i) => (
                    <div
                      key={label}
                      className={cn(
                        'flex-1 h-1.5 rounded-full transition-colors',
                        i < attunedCount
                          ? attunedCount >= MAX_ATTUNEMENT_SLOTS
                            ? 'bg-destructive'
                            : 'bg-violet-500'
                          : 'bg-muted',
                      )}
                    />
                  ))}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-1 text-right">
                {MAX_ATTUNEMENT_SLOTS - attunedCount} slot
                {MAX_ATTUNEMENT_SLOTS - attunedCount !== 1 ? 's' : ''} free
              </p>
            </div>
          </div>

          {/* Armor Class tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Shield className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Armor Class
                </p>
                <p className="text-2xl font-bold font-mono text-foreground">{calculatedAC}</p>
              </div>
            </div>
            <div className="px-4 pb-3">
              <p className="text-[10px] text-muted-foreground text-right">
                {overrideAC !== undefined ? 'override active' : 'from equipped armor'}
              </p>
            </div>
          </div>

          {/* Currency tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Coins className="h-5 w-5 text-white" weight="bold" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Currency
                </p>
                <p className="text-sm font-bold font-mono text-foreground">
                  {(totalCurrencyCopper / 100).toFixed(2)} gp
                </p>
              </div>
            </div>
            <div className="px-3 pb-3 border-t border-border/60">
              <div className="grid grid-cols-5 gap-1 pt-2">
                {(
                  [
                    ['cp', 'CP'],
                    ['sp', 'SP'],
                    ['ep', 'EP'],
                    ['gp', 'GP'],
                    ['pp', 'PP'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground font-semibold tracking-wide text-center">
                      {label}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={currency[key]}
                      onChange={(event) => {
                        const raw = Number.parseInt(event.target.value, 10)
                        updateCurrency(key, Number.isNaN(raw) ? 0 : raw)
                      }}
                      className="h-6 px-1 text-[10px] font-mono text-center"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory card */}
      <div className="px-6 pb-6 flex-1 min-h-0">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="w-full h-full flex flex-col overflow-hidden">
            {/* Gradient header band */}
            <div className="h-10 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent border-b border-border flex items-center gap-3 px-4 shrink-0">
              <Backpack className="h-4 w-4 text-accent/80" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Inventory
              </span>
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                {equipment.length}
              </Badge>
              <Button
                onClick={() => setAddItemOpen(true)}
                size="sm"
                className="ml-auto h-7 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Item
              </Button>
            </div>

            {/* Search + filter row */}
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search inventory…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {FILTER_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setItemTypeFilter(chip)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      itemTypeFilter === chip
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Item list */}
            <ScrollArea className="flex-1 overflow-hidden">
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
                {filteredEquipment.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    {equipment.length === 0
                      ? 'No items yet. Use Add Item to browse and add to inventory.'
                      : 'No items match your search or filter.'}
                  </p>
                ) : (
                  filteredEquipment.map((item) => {
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
                    const props = getPropertySummary(item)
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg border-l-4 border border-border/25 transition-colors',
                          item.equipped
                            ? 'border-l-accent bg-accent/5'
                            : 'border-l-transparent hover:bg-muted/40',
                        )}
                      >
                        {/* Type icon */}
                        <ItemIcon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            item.equipped ? 'text-accent' : 'text-muted-foreground',
                          )}
                          weight={item.equipped ? 'fill' : 'regular'}
                        />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{item.name}</span>
                            {item.rarity && item.rarity !== 'none' && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] px-1.5 py-0 capitalize h-4',
                                  getRarityClass(item.rarity),
                                )}
                              >
                                {item.rarity}
                              </Badge>
                            )}
                            {item.armorType && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 capitalize h-4"
                              >
                                {item.armorType}
                              </Badge>
                            )}
                            {item.weaponCategory && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 capitalize h-4"
                              >
                                {item.weaponCategory}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {item.weight !== undefined && <span>{item.weight} lb</span>}
                            {item.ac !== undefined && <span>AC {item.ac}</span>}
                            {dmg && <span>{dmg}</span>}
                            {item.range && <span>Range {item.range}</span>}
                            {props && <span className="truncate">{props}</span>}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Qty stepper */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItem(item.id, {
                                  quantity: Math.max(1, item.quantity - 1),
                                })
                              }
                              className="h-5 w-5 rounded border border-border text-xs leading-none flex items-center justify-center hover:bg-muted disabled:opacity-40"
                              disabled={item.quantity <= 1}
                            >
                              −
                            </button>
                            <span className="font-mono text-xs w-5 text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                              className="h-5 w-5 rounded border border-border text-xs leading-none flex items-center justify-center hover:bg-muted"
                            >
                              +
                            </button>
                          </div>

                          {/* Equip */}
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={item.equipped}
                              onCheckedChange={() => toggleEquip(item.id)}
                              className="scale-[0.75]"
                            />
                            <span className="text-xs text-muted-foreground">Equip</span>
                          </div>

                          {/* Attune */}
                          {item.reqAttune && (
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={item.attuned ?? false}
                                onCheckedChange={() => toggleAttune(item.id)}
                                disabled={!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS}
                                className="scale-[0.75]"
                              />
                              <span className="text-xs text-muted-foreground">Attune</span>
                            </div>
                          )}

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            {/* Sources accordion footer */}
            <div className="px-4 pb-4 border-t border-border shrink-0">
              <SourcesAccordion
                sectionId="equipment"
                rows={getSourcesRowsBySection('equipment')}
                emptyText="Add equipment to see source attribution."
              />
            </div>
          </Card>
        </div>
      </div>

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
    </div>
  )
}
