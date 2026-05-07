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
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { ItemSelectionModal } from '@/components/modals/ItemSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useEquipment } from '@/hooks/character/useEquipment'
import { useEquipmentProvenanceMutations } from '@/hooks/character/useEquipmentProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { isEquippable } from '@/lib/calculations/itemEquippable'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import { NoCharCard } from '../_shared'

const EQUIPMENT_EQUIP_HINT_ID = 'equipment-equip-toggle'
const EQUIP_AC_TOGGLE_SELECTOR = '[data-equip-ac-toggle="true"]'
const EQUIP_HINT_WIDTH = 300
interface HintPosition {
  top: number
  left: number
  arrowLeft: number
}

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

const EMPTY_RECORD: Record<string, string> = {}

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
  const [showEquipHint, setShowEquipHint] = useState(
    () => !isHintDismissed(EQUIPMENT_EQUIP_HINT_ID),
  )
  const [hintPosition, setHintPosition] = useState<HintPosition | null>(null)

  const handleDismissEquipHint = () => {
    setShowEquipHint(false)
    setHintDismissed(EQUIPMENT_EQUIP_HINT_ID, true)
  }

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

  useEffect(() => {
    if (!showEquipHint || equipment.length === 0) {
      setHintPosition(null)
      return
    }

    const update = () => {
      const toggle = document.querySelector<HTMLElement>(EQUIP_AC_TOGGLE_SELECTOR)
      if (!toggle) {
        setHintPosition(null)
        return
      }
      const rect = toggle.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const maxLeft = Math.max(16, window.innerWidth - EQUIP_HINT_WIDTH - 16)
      const left = Math.min(Math.max(centerX - EQUIP_HINT_WIDTH / 2, 16), maxLeft)
      const arrowLeft = Math.min(Math.max(centerX - left, 18), EQUIP_HINT_WIDTH - 18)
      setHintPosition({ top: rect.bottom + 12, left, arrowLeft })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [showEquipHint, equipment])

  const [itemSearch, setItemSearch] = useState('')
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemCategory>('All')
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup)
  const itemPropertyByAbbr =
    useGameDataStore((s) => s.gameData?.lookups?.itemPropertyByAbbr) ?? EMPTY_RECORD
  const originSystem = character?.originSystem ?? '2024'
  const preferNewerPrintings = character?.variantRules?.preferNewerPrintings ?? false

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
  const { applyManualEquipmentGrant, removeEquipmentProvenance } = useEquipmentProvenanceMutations()
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const { calculatedAC, overrideAC } = useArmorClass()
  const equipmentItems = useMemo(() => {
    if (!itemLookup) return []
    // When preferNewerPrintings is off, show all versions unfiltered.
    if (!preferNewerPrintings) return Array.from(itemLookup.values())
    // Deduplicate reprinted items based on edition:
    // - 2024 characters see the newer reprint (e.g. Drum|XPHB, Bag of Holding|XDMG)
    // - 2014 characters see the original printing (e.g. Drum|PHB, Bag of Holding|DMG)
    const suppressed = new Set<string>()
    for (const item of itemLookup.values()) {
      const reprints = Array.isArray((item as { reprintedAs?: unknown }).reprintedAs)
        ? ((item as { reprintedAs?: unknown }).reprintedAs as string[])
        : []
      for (const reprint of reprints) {
        if (typeof reprint !== 'string') continue
        const [n, s] = reprint.split('|')
        if (!n || !s) continue
        const reprintKey = `${n.trim().toLowerCase()}|${s.trim().toLowerCase()}`
        if (itemLookup.has(reprintKey)) {
          if (originSystem === '2014') {
            // Suppress the newer reprint, keep the original
            suppressed.add(reprintKey)
          } else {
            // Suppress the older original, keep the newer reprint
            suppressed.add(`${item.name.toLowerCase()}|${(item.source ?? 'phb').toLowerCase()}`)
          }
        }
      }
    }
    return Array.from(itemLookup.values()).filter(
      (item) =>
        !suppressed.has(`${item.name.toLowerCase()}|${(item.source ?? 'phb').toLowerCase()}`),
    )
  }, [itemLookup, originSystem, preferNewerPrintings])

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
      <div className="px-6 py-2 lg:py-5 page-header-band mb-2 lg:mb-6 shrink-0">
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

      {showEquipHint && hintPosition ? (
        <div
          className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
          style={{ top: hintPosition.top, left: hintPosition.left }}
        >
          <div className="pointer-events-auto animate-hint-bounce relative w-[300px] rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20">
            <div
              className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
              style={{ left: hintPosition.arrowLeft - 7 }}
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
              onClick={handleDismissEquipHint}
              aria-label="Dismiss hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="leading-snug text-accent-foreground/95 pr-8">
              Toggle <strong>Equip</strong> on armor, weapons, and worn magic items to mark them
              active and applying their effect.
            </p>
          </div>
        </div>
      ) : null}

      {/* Stat tiles */}
      <div className="px-6 mb-2 lg:mb-6 shrink-0">
        <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
          {/* Weight tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-2 lg:p-4">
              <div className="h-8 w-8 lg:h-11 lg:w-11 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-sm">
                <Scales className="h-4 w-4 lg:h-5 lg:w-5 text-primary-foreground" weight="bold" />
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
            <div className="px-2 lg:px-4 pb-2 lg:pb-3">
              <div className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={cn('h-full transition-all rounded-full', encumbranceTone)}
                  style={{ width: `${encumbrancePct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1 text-right">
                {isEncumbered ? 'Encumbered' : `${encumbrancePct.toFixed(0)}%`}
              </p>
            </div>
          </div>

          {/* Attunement tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-2 lg:p-4">
              <div className="h-8 w-8 lg:h-11 lg:w-11 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Diamond className="h-4 w-4 lg:h-5 lg:w-5 text-white" weight="bold" />
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
            <div className="px-2 lg:px-4 pb-2 lg:pb-3">
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
              <p className="text-xs text-muted-foreground font-mono mt-1 text-right">
                {MAX_ATTUNEMENT_SLOTS - attunedCount} slot
                {MAX_ATTUNEMENT_SLOTS - attunedCount !== 1 ? 's' : ''} free
              </p>
            </div>
          </div>

          {/* Armor Class tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-2 lg:p-4">
              <div className="h-8 w-8 lg:h-11 lg:w-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Shield className="h-4 w-4 lg:h-5 lg:w-5 text-white" weight="bold" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Armor Class
                </p>
                <p className="text-2xl font-bold font-mono text-foreground">{calculatedAC}</p>
              </div>
            </div>
            <div className="px-2 lg:px-4 pb-2 lg:pb-3">
              <p className="text-xs text-muted-foreground text-right">
                {overrideAC !== undefined ? 'override active' : 'from equipped armor'}
              </p>
            </div>
          </div>

          {/* Currency tile */}
          <div className="border border-border rounded-xl shadow-sm bg-card overflow-hidden">
            <div className="flex items-center justify-between p-2 lg:p-4">
              <div className="h-8 w-8 lg:h-11 lg:w-11 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600/60 flex items-center justify-center shrink-0 shadow-sm">
                <Coins className="h-4 w-4 lg:h-5 lg:w-5 text-white" weight="bold" />
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
            <div className="px-1.5 lg:px-3 pb-2 lg:pb-3">
              <div className="grid grid-cols-5 gap-0.5 lg:gap-1 pt-1 lg:pt-2">
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
      <div className="px-6 pb-3 lg:pb-6 flex-1 min-h-0">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="w-full h-full flex flex-col overflow-hidden">
            {/* Gradient header band */}
            <div className="h-10 bg-gradient-to-r from-accent/20 via-accent/10 to-transparent border-b border-border flex items-center gap-3 px-4 shrink-0">
              <Backpack className="h-4 w-4 text-primary/80" weight="duotone" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Inventory
              </span>
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                {equipment.length}
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleIgnoreRestrictions}
                      className={cn(
                        'flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                        ignoreEquipRestrictions
                          ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <ShieldWarning
                        className="h-4 w-4"
                        weight={ignoreEquipRestrictions ? 'fill' : 'regular'}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {ignoreEquipRestrictions
                      ? 'Restrictions ignored — click to enforce armor slots & proficiency'
                      : 'Enforce armor slots & proficiency (click to ignore)'}
                  </TooltipContent>
                </Tooltip>
                <Button
                  onClick={() => setAddItemOpen(true)}
                  size="sm"
                  className="h-7 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Item
                </Button>
              </div>
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
                    const props = getPropertySummary(item, itemPropertyByAbbr)
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
                            item.equipped ? 'text-primary' : 'text-muted-foreground',
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
                          {(isEquippable(item) || item.equipped) && (
                            <div className="flex items-center gap-1" data-equip-ac-toggle="true">
                              <Switch
                                checked={item.equipped}
                                onCheckedChange={() => toggleEquip(item.id)}
                                className="scale-[0.75]"
                              />
                              <span className="text-xs text-muted-foreground">Equip</span>
                            </div>
                          )}

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
