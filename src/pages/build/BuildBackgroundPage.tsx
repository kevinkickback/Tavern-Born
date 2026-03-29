import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Scroll,
    CaretLeft,
    CaretRight,
} from '@phosphor-icons/react'
import { renderEntry } from '@/lib/renderer'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { cn } from '@/lib/utils'
import type { Background5e } from '@/types/5etools'
import { NoCharCard, InfoTile } from '@/pages/_shared'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { matchesGameDataEntry } from '@/lib/characterUtils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getBgEntries(bg: Background5e): { name?: string; entries: any[] }[] {
    return (bg.entries as any[] ?? [])
        .filter((e) => typeof e === 'object' && e.type === 'entries')
        .map((e: any) => ({ name: e.name as string | undefined, entries: e.entries ?? [] }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildBackgroundPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { backgrounds } = useFilteredGameData()
    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [bgSearch, setBgSearch] = useState('')

    const filteredBackgrounds = useMemo(() => {
        const q = bgSearch.trim().toLowerCase()
        if (!q) return backgrounds
        return backgrounds.filter((b) => b.name.toLowerCase().includes(q))
    }, [backgrounds, bgSearch])

    if (!character) {
        return <NoCharCard icon={<Scroll weight="duotone" />} noun="choose a background" />
    }

    const selectedBg = backgrounds.find((b) =>
        matchesGameDataEntry(character.background, character.backgroundSource, b),
    ) as Background5e | undefined

    const handleBackground = (name: string, bgSource?: string) => {
        const bg = backgrounds.find((b) =>
            matchesGameDataEntry(name, bgSource, b),
        ) as Background5e | undefined
        if (!bg) return
        const langs = extractProficiencyBlockNames(bg.languageProficiencies ?? [])
        const tools = extractProficiencyBlockNames(bg.toolProficiencies ?? [])
        updateCharacter(character.id, {
            background: name,
            backgroundSource: bgSource ?? undefined,
            proficiencies: {
                ...character.proficiencies,
                languages: [...new Set([...character.proficiencies.languages, ...langs])],
                tools: [...new Set([...character.proficiencies.tools, ...tools])],
            },
        })
        if (detailCollapsed) setDetailCollapsed(false)
    }

    const skills = selectedBg ? extractProficiencyBlockNames(selectedBg.skillProficiencies ?? []) : []
    const langs = selectedBg ? extractProficiencyBlockNames(selectedBg.languageProficiencies ?? []) : []
    const tools = selectedBg ? extractProficiencyBlockNames(selectedBg.toolProficiencies ?? []) : []

    // Equipment package options
    const equipmentPackages: { label: string; entries: any[] }[] = []
    for (const block of (selectedBg?.startingEquipment ?? [])) {
        if (Array.isArray(block)) continue
        if (typeof block === 'object' && block.A) {
            equipmentPackages.push({ label: 'Option A', entries: block.A ?? [] })
            if (block.B) equipmentPackages.push({ label: 'Option B', entries: block.B ?? [] })
        }
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <Scroll className="h-6 w-6 text-accent" weight="duotone" />
                        Background
                    </h1>
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-6 pb-6">
                <div className="max-w-7xl mx-auto h-full">
                    <Card className="h-full overflow-hidden flex flex-col">
                        <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">

                            {/* Toggle button */}
                            <button
                                onClick={() => setDetailCollapsed((c) => !c)}
                                title={detailCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
                            >
                                {detailCollapsed ? (
                                    <CaretLeft className="h-3.5 w-3.5" />
                                ) : (
                                    <CaretRight className="h-3.5 w-3.5" />
                                )}
                            </button>

                            {/* Left pane — background list */}
                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-border flex flex-col gap-2">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Backgrounds ({filteredBackgrounds.length}{bgSearch ? ` of ${backgrounds.length}` : ''})
                                    </span>
                                    <Input
                                        placeholder="Search backgrounds…"
                                        value={bgSearch}
                                        onChange={(e) => setBgSearch(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4 space-y-1 pr-8">
                                        {filteredBackgrounds.map((bg) => {
                                            const isSelected = character.backgroundSource
                                                ? (character.background === bg.name && character.backgroundSource === (bg.source ?? ''))
                                                : character.background === bg.name
                                            const hasEquip = (bg.startingEquipment ?? []).some(
                                                (b: any) => typeof b === 'object' && b.A,
                                            )
                                            return (
                                                <div
                                                    key={`${bg.name}|${bg.source ?? ''}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        if ((e.target as HTMLElement).closest('[data-radix-select-trigger],[data-radix-select-content]')) return
                                                        handleBackground(bg.name, bg.source ?? undefined)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') handleBackground(bg.name, bg.source ?? undefined)
                                                    }}
                                                    className={cn(
                                                        'w-full text-left p-3 rounded-lg border transition-colors cursor-pointer hover:border-accent flex items-center justify-between gap-2',
                                                        isSelected
                                                            ? 'border-accent bg-accent/10'
                                                            : 'border-border bg-card',
                                                    )}
                                                >
                                                    {/* Radio dot + name */}
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div
                                                            className={cn(
                                                                'h-3.5 w-3.5 rounded-full border-2 flex-shrink-0',
                                                                isSelected ? 'bg-accent border-accent' : 'border-muted-foreground',
                                                            )}
                                                        />
                                                        <span className="font-medium text-sm truncate">{bg.name}</span>
                                                    </div>

                                                    {/* Right side: equipment dropdown when selected + has options, badge otherwise */}
                                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {isSelected && hasEquip && equipmentPackages.length > 1 ? (
                                                            <Select defaultValue="A">
                                                                <SelectTrigger className="h-7 text-xs min-w-[110px] max-w-[160px]">
                                                                    <SelectValue placeholder="Equipment…" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {equipmentPackages.map((pkg) => (
                                                                        <SelectItem key={pkg.label} value={pkg.label} className="text-xs">
                                                                            {pkg.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <Badge variant="outline" className="text-xs">{bg.source}</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* Right pane — background detail */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                                    detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-1/2 min-w-[320px]',
                                )}
                            >
                                <div className="p-4 border-b border-border">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Details
                                    </span>
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4">
                                        {selectedBg ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <h2 className="text-2xl font-display font-bold">{selectedBg.name}</h2>
                                                    <Badge variant="outline" className="mt-2">{selectedBg.source}</Badge>
                                                </div>

                                                <Separator />

                                                <div className="grid grid-cols-1 gap-3">
                                                    <InfoTile title="Skill Proficiencies">
                                                        {skills.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {skills.map((s) => (
                                                                    <Badge key={s} variant="secondary" className="capitalize text-xs">{s}</Badge>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">—</span>
                                                        )}
                                                    </InfoTile>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <InfoTile title="Languages">
                                                            {langs.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {langs.map((l) => (
                                                                        <Badge key={l} variant="secondary" className="capitalize text-xs">{l}</Badge>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground text-sm">—</span>
                                                            )}
                                                        </InfoTile>
                                                        <InfoTile title="Tool Proficiencies">
                                                            {tools.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {tools.map((t) => (
                                                                        <Badge key={t} variant="secondary" className="capitalize text-xs">{t}</Badge>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground text-sm">—</span>
                                                            )}
                                                        </InfoTile>
                                                    </div>
                                                </div>

                                                {/* Background feature entries rendered via renderEntry */}
                                                {getBgEntries(selectedBg).map((section, i) => (
                                                    <div key={i}>
                                                        {section.name && (
                                                            <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2 mt-3">{section.name}</h4>
                                                        )}
                                                        {section.entries.map((e: any, j: number) => (
                                                            <div
                                                                key={j}
                                                                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                                                                dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                                                Select a background to view details
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>

                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
