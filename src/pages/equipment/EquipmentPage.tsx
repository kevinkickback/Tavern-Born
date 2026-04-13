import { Backpack, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ItemSelectionModal } from '@/components/modals/ItemSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useEquipment } from '@/hooks/character/useEquipment'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { getViewportBoundedMaxHeight } from '@/lib/layoutHeights'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'
import { NoCharCard } from '../_shared'

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
  if (item.dmg2) {
    return `${item.dmg1}${damageType} (${item.dmg2} versatile)`
  }
  return `${item.dmg1}${damageType}`
}

function getPropertySummary(item: Equipment): string | null {
  if (!item.properties || item.properties.length === 0) return null
  return item.properties.join(', ')
}

export function EquipmentPage() {
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [inventoryListMaxHeight, setInventoryListMaxHeight] = useState(() =>
    getViewportBoundedMaxHeight(18),
  )
  const summaryCardRef = useRef<HTMLDivElement | null>(null)
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
    derivedAC,
    currency,
    totalCurrencyCopper,
    addFromGameData,
    removeItem,
    updateItem,
    toggleEquip,
    toggleAttune,
    updateCurrency,
  } = useEquipment()
  const equipmentItems = useMemo(() => {
    const merged = new Map<string, Item5e>()

    for (const item of items as Item5e[]) {
      const key = `${item.name}|${item.source ?? ''}`
      merged.set(key, item)
    }

    for (const item of (itemsBase ?? []) as Item5e[]) {
      const key = `${item.name}|${item.source ?? ''}`
      if (!merged.has(key)) {
        merged.set(key, item)
      }
    }

    return Array.from(merged.values())
  }, [items, itemsBase])

  const encumbrancePct = carryCapacity > 0 ? Math.min(100, (totalWeight / carryCapacity) * 100) : 0
  const encumbranceTone =
    encumbrancePct >= 100 ? 'bg-destructive' : encumbrancePct >= 75 ? 'bg-warning' : 'bg-accent'

  const handleAddItem = (item: Item5e) => {
    addFromGameData(item)
    applyManualEquipmentGrant(item.name)
  }
  const handleRemoveItem = (itemId: string) => {
    const existing = equipment.find((item) => item.id === itemId)
    removeItem(itemId)
    if (existing) removeEquipmentProvenance(existing.name)
  }

  useEffect(() => {
    const updateInventoryListMaxHeight = () => {
      const summaryHeight = summaryCardRef.current?.offsetHeight ?? 0
      setInventoryListMaxHeight(getViewportBoundedMaxHeight(18, summaryHeight + 16))
    }

    updateInventoryListMaxHeight()

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            updateInventoryListMaxHeight()
          })

    if (summaryCardRef.current && resizeObserver) {
      resizeObserver.observe(summaryCardRef.current)
    }

    window.addEventListener('resize', updateInventoryListMaxHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateInventoryListMaxHeight)
    }
  }, [])

  if (!character) {
    return <NoCharCard icon={<Backpack weight="duotone" />} noun="manage equipment" />
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={() => setAddItemOpen(true)}
          className="bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>
      <div className="space-y-4">
        {/* Summary bar */}
        <div ref={summaryCardRef}>
          <Card className="w-full">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Weight</div>
                  <div
                    className={cn(
                      'text-sm font-mono font-bold',
                      isEncumbered && 'text-destructive',
                    )}
                  >
                    {totalWeight.toFixed(1)} / {carryCapacity} lb
                    {isEncumbered && ' (Encumbered)'}
                  </div>
                  <div className="mt-1.5 w-44 space-y-1">
                    <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
                      <div
                        className={cn('h-full transition-all', encumbranceTone)}
                        style={{ width: `${encumbrancePct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {encumbrancePct.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Attunement</div>
                  <div
                    className={cn(
                      'text-sm font-mono font-bold',
                      attunedCount >= MAX_ATTUNEMENT_SLOTS && 'text-destructive',
                    )}
                  >
                    {attunedCount} / {MAX_ATTUNEMENT_SLOTS}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Armor Class</div>
                  <div className="text-sm font-mono font-bold">{derivedAC}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Currency</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        ['cp', 'CP'],
                        ['sp', 'SP'],
                        ['ep', 'EP'],
                        ['gp', 'GP'],
                        ['pp', 'PP'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground font-semibold tracking-wide">
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
                          className="h-7 w-16 px-2 text-xs font-mono"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-1">
                    Total: {(totalCurrencyCopper / 100).toFixed(2)} gp
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory list */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="font-display text-xl flex items-center gap-2">
              <Backpack className="h-5 w-5 text-primary" weight="duotone" />
              Inventory ({equipment.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {equipment.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No items yet. Use Add Item to browse and add to inventory.
              </p>
            ) : (
              <div
                className="space-y-2 overflow-y-auto pr-1"
                style={{ maxHeight: inventoryListMaxHeight }}
              >
                {equipment.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg border',
                      item.equipped ? 'border-accent bg-accent' : 'border-border',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{item.name}</span>
                        {item.rarity && item.rarity !== 'none' && (
                          <Badge variant="secondary" className="text-xs capitalize">
                            {item.rarity}
                          </Badge>
                        )}
                        {item.armorType && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.armorType}
                          </Badge>
                        )}
                        {item.weaponCategory && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.weaponCategory}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {item.weight !== undefined && <span>{item.weight} lb</span>}
                        {item.ac !== undefined && <span>AC {item.ac}</span>}
                        {getDamageSummary(item) && <span>DMG {getDamageSummary(item)}</span>}
                        {item.range && <span>Range {item.range}</span>}
                        <span>×{item.quantity}</span>
                      </div>
                      {getPropertySummary(item) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Properties: {getPropertySummary(item)}
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateItem(item.id, {
                            quantity: Math.max(1, item.quantity - 1),
                          })
                        }
                        className="h-5 w-5 rounded border border-border text-xs leading-none"
                        disabled={item.quantity <= 1}
                      >
                        −
                      </button>
                      <span className="font-mono text-xs w-5 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                        className="h-5 w-5 rounded border border-border text-xs leading-none"
                      >
                        +
                      </button>
                    </div>

                    {/* Equip toggle */}
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={item.equipped}
                        onCheckedChange={() => toggleEquip(item.id)}
                        className="scale-[0.8]"
                      />
                      <span className="text-xs">Equip</span>
                    </div>

                    {/* Attune toggle */}
                    {item.reqAttune && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={item.attuned ?? false}
                          onCheckedChange={() => toggleAttune(item.id)}
                          disabled={!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS}
                          className="scale-[0.8]"
                        />
                        <span className="text-xs">Attune</span>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <div className="px-6 pb-4 border-t border-border">
            <SourcesAccordion
              sectionId="equipment"
              rows={getSourcesRowsBySection('equipment')}
              emptyText="Add equipment to see source attribution."
            />
          </div>
        </Card>
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
