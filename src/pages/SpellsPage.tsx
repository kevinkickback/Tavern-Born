import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    MagicWand,
    Plus,
    Trash,
    ArrowCounterClockwise,
    BookOpen,
    Check,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import { NoCharCard } from './_shared'
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'

export function SpellsPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const { spells } = useFilteredGameData()
    const { applyManualSpellGrant, removeSpellProvenance, getSourcesRowsBySection } = useProvenance()
    const {
        slots,
        isSpellcaster,
        cantrips,
        spellsKnown,
        preparedSpells,
        useSlot,
        restoreSlot,
        longRest,
        addCantrip,
        removeCantrip,
        addSpellKnown,
        removeSpellKnown,
        togglePrepared,
        syncSlots,
    } = useSpellSlots()
    const [spellSearch, setSpellSearch] = useState('')
    const [levelFilter, setLevelFilter] = useState<string>('all')
    const [spellModalOpen, setSpellModalOpen] = useState(false)

    if (!character) {
        return <NoCharCard icon={<MagicWand weight="duotone" />} noun="manage spells" />
    }

    const classLower = character.class?.toLowerCase() ?? ''

    const filteredSpells = useMemo(
        () =>
            (spells as Spell5e[]).filter((s) => {
                if (spellSearch && !s.name.toLowerCase().includes(spellSearch.toLowerCase())) return false
                if (levelFilter !== 'all' && String(s.level) !== levelFilter) return false
                if (classLower) {
                    const fromList = s.classes?.fromClassList ?? []
                    if (fromList.length > 0 && !fromList.some((c: any) => c.name?.toLowerCase() === classLower))
                        return false
                }
                return true
            }),
        [spells, spellSearch, levelFilter, classLower],
    )

    const ownedSet = new Set([...cantrips, ...spellsKnown])
    const handleRemoveCantrip = (name: string) => {
        removeCantrip(name)
        removeSpellProvenance(name)
    }
    const handleRemoveKnownSpell = (name: string) => {
        removeSpellKnown(name)
        removeSpellProvenance(name)
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Spell slots panel */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="w-full">
                        <CardHeader>
                            <CardTitle className="font-display text-xl flex items-center gap-2">
                                <MagicWand className="h-5 w-5 text-accent" weight="duotone" />
                                Spell Slots
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!isSpellcaster ? (
                                <p className="text-sm text-muted-foreground py-2">
                                    {character.class || 'This class'} is not a spellcaster.
                                </p>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        {slots.map((slot) => (
                                            <div key={slot.level} className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-medium min-w-16">
                                                    Lv {slot.level}
                                                    {slot.isPactMagic && (
                                                        <Badge variant="secondary" className="ml-1 text-xs">
                                                            Pact
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex gap-1 flex-1">
                                                    {Array.from({ length: slot.max }, (_, i) => (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onClick={() =>
                                                                i < slot.used ? restoreSlot(slot.level) : useSlot(slot.level)
                                                            }
                                                            className={cn(
                                                                'h-5 w-5 rounded-full border-2 transition-colors flex-shrink-0',
                                                                i < slot.used
                                                                    ? 'bg-muted border-muted-foreground'
                                                                    : 'bg-accent border-accent',
                                                            )}
                                                            title={i < slot.used ? 'Restore slot' : 'Use slot'}
                                                        />
                                                    ))}
                                                </div>
                                                <span className="text-xs text-muted-foreground font-mono">
                                                    {slot.available}/{slot.max}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                                        <Button variant="outline" size="sm" onClick={longRest} className="flex-1 text-xs">
                                            <ArrowCounterClockwise className="h-3 w-3 mr-1" />
                                            Long Rest
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={syncSlots} className="text-xs">
                                            Sync
                                        </Button>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Known spells + cantrips */}
                    {isSpellcaster && (
                        <Card className="w-full">
                            <CardHeader>
                                <CardTitle className="font-display text-lg">Known Spells</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="known">
                                    <TabsList className="mb-3">
                                        <TabsTrigger value="cantrips">Cantrips ({cantrips.length})</TabsTrigger>
                                        <TabsTrigger value="known">Known ({spellsKnown.length})</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="cantrips">
                                        <SpellList
                                            names={cantrips}
                                            preparedSpells={preparedSpells}
                                            onRemove={handleRemoveCantrip}
                                            onTogglePrepared={() => undefined}
                                            showPrepare={false}
                                        />
                                    </TabsContent>
                                    <TabsContent value="known">
                                        <SpellList
                                            names={spellsKnown}
                                            preparedSpells={preparedSpells}
                                            onRemove={handleRemoveKnownSpell}
                                            onTogglePrepared={togglePrepared}
                                            showPrepare
                                        />
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                            <div className="px-6 pb-4 border-t border-border">
                                <SourcesAccordion
                                    sectionId="spells"
                                    rows={getSourcesRowsBySection('spells')}
                                    emptyText="Add spells to see their source attribution."
                                />
                            </div>
                        </Card>
                    )}
                </div>

                {/* Spell browser */}
                <div className="lg:col-span-2">
                    <Card className="w-full">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <CardTitle className="font-display text-xl flex items-center gap-2">
                                    <BookOpen className="h-5 w-5 text-accent" weight="duotone" />
                                    Spell Browser
                                </CardTitle>
                                <Button
                                    size="sm"
                                    className="bg-accent text-accent-foreground hover:bg-accent/90 flex-shrink-0"
                                    onClick={() => setSpellModalOpen(true)}
                                >
                                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                                    Add Spells
                                </Button>
                            </div>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <Input
                                    placeholder="Search spells…"
                                    value={spellSearch}
                                    onChange={(e) => setSpellSearch(e.target.value)}
                                    className="max-w-xs"
                                />
                                <Select value={levelFilter} onValueChange={setLevelFilter}>
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All levels</SelectItem>
                                        <SelectItem value="0">Cantrip</SelectItem>
                                        {Array.from({ length: 9 }, (_, i) => (
                                            <SelectItem key={i + 1} value={String(i + 1)}>
                                                Level {i + 1}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
                                {filteredSpells.slice(0, 200).map((spell) => {
                                    const owned = ownedSet.has(spell.name)
                                    return (
                                        <div
                                            key={`${spell.name}|${spell.source ?? ''}`}
                                            className={cn(
                                                'flex items-center justify-between px-3 py-2 rounded-lg border text-sm',
                                                owned ? 'border-accent/40 bg-accent/5' : 'border-border',
                                            )}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Badge variant="outline" className="font-mono text-xs flex-shrink-0">
                                                    {spell.level === 0 ? 'C' : spell.level}
                                                </Badge>
                                                <span className="font-medium truncate">{spell.name}</span>
                                                <span className="text-xs text-muted-foreground capitalize flex-shrink-0">
                                                    {spell.school}
                                                </span>
                                            </div>
                                            {!owned ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 flex-shrink-0 ml-2"
                                                    onClick={() => {
                                                        if (spell.level === 0) addCantrip(spell.name)
                                                        else addSpellKnown(spell.name)
                                                        applyManualSpellGrant(spell.name)
                                                    }}
                                                    title="Add to known spells"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            ) : (
                                                <Check className="h-4 w-4 text-accent flex-shrink-0 ml-2" />
                                            )}
                                        </div>
                                    )
                                })}
                                {filteredSpells.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-8">No spells found</p>
                                )}
                                {filteredSpells.length > 200 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                        Showing first 200 of {filteredSpells.length} — refine your search
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <SpellSelectionModal
                open={spellModalOpen}
                onOpenChange={setSpellModalOpen}
                spells={spells as Spell5e[]}
                ownedNames={ownedSet}
                classFilter={classLower}
                onConfirm={(names) => {
                    for (const name of names) {
                        const spell = (spells as Spell5e[]).find((s) => s.name === name)
                        if (spell?.level === 0) addCantrip(name)
                        else addSpellKnown(name)
                        applyManualSpellGrant(name)
                    }
                }}
            />
        </div>
    )
}

function SpellList({
    names,
    preparedSpells,
    onRemove,
    onTogglePrepared,
    showPrepare,
}: {
    names: string[]
    preparedSpells: string[]
    onRemove: (name: string) => void
    onTogglePrepared: (name: string) => void
    showPrepare: boolean
}) {
    if (!names.length) {
        return <p className="text-xs text-muted-foreground py-2 text-center">None</p>
    }
    return (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {names.map((name) => {
                const prepared = preparedSpells.includes(name)
                return (
                    <div key={name} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                            {showPrepare && (
                                <button
                                    type="button"
                                    onClick={() => onTogglePrepared(name)}
                                    className={cn(
                                        'h-3 w-3 rounded-full border-2 flex-shrink-0 transition-colors',
                                        prepared ? 'bg-accent border-accent' : 'border-muted-foreground',
                                    )}
                                    title={prepared ? 'Prepared' : 'Not prepared'}
                                />
                            )}
                            <span className="text-sm">{name}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => onRemove(name)}
                        >
                            <Trash className="h-3 w-3" />
                        </Button>
                    </div>
                )
            })}
        </div>
    )
}
