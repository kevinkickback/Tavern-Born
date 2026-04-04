import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Backpack, Plus, Trash, ShieldCheck } from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useEquipment } from '@/hooks/character/useEquipment'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import type { Item5e } from '@/types/5etools'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { NoCharCard } from './_shared'

export function EquipmentPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { items } = useFilteredGameData()
    const {
        applyManualEquipmentGrant,
        removeEquipmentProvenance,
        getSourcesRowsBySection,
    } = useProvenance()
    const {
        equipment,
        totalWeight,
        carryCapacity,
        isEncumbered,
        attunedCount,
        derivedAC,
        addFromGameData,
        removeItem,
        updateItem,
        toggleEquip,
        toggleAttune,
    } = useEquipment()
    const [itemSearch, setItemSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<string>('all')

    if (!character) {
        return <NoCharCard icon={<Backpack weight="duotone" />} noun="manage equipment" />
    }

    const filteredItems = useMemo(
        () =>
            (items as Item5e[]).filter((item) => {
                if (itemSearch && !item.name.toLowerCase().includes(itemSearch.toLowerCase())) return false
                if (typeFilter !== 'all' && item.type !== typeFilter) return false
                return true
            }),
        [items, itemSearch, typeFilter],
    )

    const typeOptions = useMemo(() => {
        const types = new Set((items as Item5e[]).map((i) => i.type).filter(Boolean))
        return Array.from(types).sort() as string[]
    }, [items])

    const encumbrancePct = carryCapacity > 0 ? Math.min(100, (totalWeight / carryCapacity) * 100) : 0
    const handleAddItem = (item: Item5e) => {
        addFromGameData(item)
        applyManualEquipmentGrant(item.name)
    }
    const handleRemoveItem = (itemId: string) => {
        const existing = equipment.find((item) => item.id === itemId)
        removeItem(itemId)
        if (existing) removeEquipmentProvenance(existing.name)
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Inventory panel */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Summary bar */}
                    <Card className="w-full">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex items-center gap-6 flex-wrap">
                                <div>
                                    <div className="text-xs text-muted-foreground mb-0.5">Weight</div>
                                    <div className={cn('text-sm font-mono font-bold', isEncumbered && 'text-destructive')}>
                                        {totalWeight.toFixed(1)} / {carryCapacity} lb
                                        {isEncumbered && ' (Encumbered)'}
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
                                    <div className="text-xs text-muted-foreground mb-0.5">Derived AC</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-bold">{derivedAC}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs h-6 px-2"
                                            onClick={() =>
                                                updateCharacter(character.id, { armorClass: derivedAC })
                                            }
                                        >
                                            <ShieldCheck className="h-3 w-3 mr-1" />
                                            Sync
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Inventory list */}
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="font-display text-xl flex items-center gap-2">
                                <Backpack className="h-5 w-5 text-accent" weight="duotone" />
                                Inventory ({equipment.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {equipment.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    No items. Browse and add from the panel on the right.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                    {equipment.map((item) => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                'flex items-center gap-3 px-3 py-2 rounded-lg border',
                                                item.equipped ? 'border-accent/40 bg-accent/5' : 'border-border',
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
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                    {item.weight !== undefined && <span>{item.weight} lb</span>}
                                                    {item.ac !== undefined && <span>AC {item.ac}</span>}
                                                    <span>×{item.quantity}</span>
                                                </div>
                                            </div>

                                            {/* Quantity */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })
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
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <Switch
                                                    checked={item.equipped}
                                                    onCheckedChange={() => toggleEquip(item.id)}
                                                    className="scale-[0.8]"
                                                />
                                                <span className="text-xs">Equip</span>
                                            </label>

                                            {/* Attune toggle */}
                                            {item.reqAttune && (
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <Switch
                                                        checked={item.attuned ?? false}
                                                        onCheckedChange={() => toggleAttune(item.id)}
                                                        disabled={!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS}
                                                        className="scale-[0.8]"
                                                    />
                                                    <span className="text-xs">Attune</span>
                                                </label>
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

                {/* Item browser */}
                <div className="lg:col-span-1">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="font-display text-lg">Item Browser</CardTitle>
                            <div className="space-y-2 mt-2">
                                <Input
                                    placeholder="Search items…"
                                    value={itemSearch}
                                    onChange={(e) => setItemSearch(e.target.value)}
                                />
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All types</SelectItem>
                                        {typeOptions.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                                {filteredItems.slice(0, 150).map((item) => (
                                    <button
                                        key={`${item.name}|${item.source ?? ''}`}
                                        type="button"
                                        onClick={() => handleAddItem(item)}
                                        className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium truncate">{item.name}</span>
                                            <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                            <span>{item.type}</span>
                                            {item.rarity && item.rarity !== 'none' && (
                                                <span className="capitalize">{item.rarity}</span>
                                            )}
                                            {item.weight !== undefined && <span>{item.weight} lb</span>}
                                        </div>
                                    </button>
                                ))}
                                {filteredItems.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-6">No items found</p>
                                )}
                                {filteredItems.length > 150 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                        Showing 150 of {filteredItems.length} — refine your search
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
