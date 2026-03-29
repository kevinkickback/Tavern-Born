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
    PersonSimple,
    CaretLeft,
    CaretRight,
} from '@phosphor-icons/react'
import { renderEntry } from '@/lib/renderer'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { cn } from '@/lib/utils'
import type { Race5e } from '@/types/5etools'
import { NoCharCard, InfoTile } from '@/pages/_shared'
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { matchesGameDataEntry } from '@/lib/characterUtils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getSpeedText(race: Race5e): string {
    if (!race.speed) return '—'
    if (typeof race.speed === 'number') return `${race.speed} ft.`
    if (typeof race.speed === 'object' && 'walk' in race.speed) return `${race.speed.walk ?? 30} ft.`
    return '—'
}

function getASILines(race: Race5e): string[] {
    const lines: string[] = []
    for (const block of race.ability ?? []) {
        for (const [key, val] of Object.entries(block)) {
            if (key !== 'choose' && typeof val === 'number') lines.push(`${key.toUpperCase()} +${val}`)
        }
        const choose = (block as any).choose
        if (choose) {
            lines.push(
                `Choose ${choose.count} from ${(choose.from as string[]).join(', ').toUpperCase()} +${choose.amount ?? 1}`,
            )
        }
    }
    return lines
}

function getLanguages(race: Race5e): string {
    return extractProficiencyBlockNames(race.languageProficiencies ?? [])
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(', ')
}

function getRaceTraits(race: Race5e): { name: string; entries: any[] }[] {
    const skip = new Set(['Age', 'Alignment', 'Size', 'Speed', 'Languages', 'Names'])
    return (race.entries as any[] ?? [])
        .filter(
            (e) =>
                typeof e === 'object' &&
                e.type === 'entries' &&
                e.name &&
                !skip.has(e.name) &&
                !e.name.includes('Names'),
        )
        .map((e: any) => ({ name: e.name as string, entries: e.entries ?? [] }))
}

/**
 * Merge a subrace onto its parent race so inherited fields are never blank.
 * - ability: subrace replaces parent when overwrite.ability is true, otherwise additive
 * - size / speed / languageProficiencies: fall back to parent when subrace omits them
 * - all other fields: subrace wins (more specific)
 */
function mergeRaceWithSubrace(parent: Race5e, subrace: Race5e): Race5e {
    const replacesAbility = (subrace as any).overwrite?.ability === true
    const mergedAbility = subrace.ability && (subrace.ability as any[]).length > 0
        ? replacesAbility
            ? subrace.ability
            : [...(parent.ability ?? []), ...(subrace.ability as any[])]
        : (parent.ability ?? [])
    return {
        ...subrace,
        ability: mergedAbility,
        size: subrace.size ?? parent.size,
        speed: subrace.speed ?? parent.speed,
        languageProficiencies: subrace.languageProficiencies ?? parent.languageProficiencies,
    } as Race5e
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildRacePage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { races } = useFilteredGameData()
    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [raceSearch, setRaceSearch] = useState('')

    const filteredRaces = useMemo(() => {
        const q = raceSearch.trim().toLowerCase()
        if (!q) return races
        return races.filter((r) => r.name.toLowerCase().includes(q))
    }, [races, raceSearch])

    if (!character) {
        return <NoCharCard icon={<PersonSimple weight="duotone" />} noun="choose a race" />
    }

    const selectedRace = races.find((r) =>
        matchesGameDataEntry(character.race, character.raceSource, r),
    ) as Race5e | undefined
    const subraces = (selectedRace?.subraces ?? []) as Race5e[]
    const selectedSubrace = subraces.find((sr) => sr.name === character.subrace)
    const displayRace = selectedSubrace && selectedRace
        ? mergeRaceWithSubrace(selectedRace, selectedSubrace)
        : (selectedSubrace ?? selectedRace)

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <PersonSimple className="h-6 w-6 text-accent" weight="duotone" />
                        Race
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

                            {/* Left pane — race list */}
                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                                <div className="p-4 border-b border-border flex flex-col gap-2">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Races ({filteredRaces.length}{raceSearch ? ` of ${races.length}` : ''})
                                    </span>
                                    <Input
                                        placeholder="Search races…"
                                        value={raceSearch}
                                        onChange={(e) => setRaceSearch(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4 space-y-1 pr-8">
                                        {filteredRaces.map((race) => {
                                            const isSelected = character.raceSource
                                                ? (character.race === race.name && character.raceSource === (race.source ?? ''))
                                                : character.race === race.name
                                            const namedSubraces = (race.subraces ?? [] as Race5e[]).filter((sr: any) => sr.name) as Race5e[]
                                            const hasSubraces = namedSubraces.length > 0
                                            return (
                                                <div
                                                    key={`${race.name}|${race.source ?? ''}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => {
                                                        // don't re-fire if click came from inside the subrace Select
                                                        if ((e.target as HTMLElement).closest('[data-radix-select-trigger],[data-radix-select-content]')) return
                                                        updateCharacter(character.id, { race: race.name, raceSource: race.source ?? undefined, subrace: undefined, subraceSource: undefined })
                                                        if (detailCollapsed) setDetailCollapsed(false)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            updateCharacter(character.id, { race: race.name, raceSource: race.source ?? undefined, subrace: undefined, subraceSource: undefined })
                                                            if (detailCollapsed) setDetailCollapsed(false)
                                                        }
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
                                                        <span className="font-medium text-sm truncate">{race.name}</span>
                                                    </div>

                                                    {/* Right side: subrace dropdown when selected, badges otherwise */}
                                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        {isSelected && hasSubraces ? (
                                                            <Select
                                                                value={character.subrace ?? ''}
                                                                onValueChange={(v) => updateCharacter(character.id, { subrace: v })}
                                                            >
                                                                <SelectTrigger className="h-7 text-xs min-w-[120px] max-w-[180px]">
                                                                    <SelectValue placeholder="Subrace…" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {namedSubraces.map((sr) => (
                                                                        <SelectItem
                                                                            key={`${sr.name}|${(sr as any).source ?? ''}`}
                                                                            value={sr.name}
                                                                            className="text-xs"
                                                                        >
                                                                            {sr.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            <>
                                                                {hasSubraces && (
                                                                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                                                        {namedSubraces.length} subraces
                                                                    </Badge>
                                                                )}
                                                                <Badge variant="outline" className="text-xs">{race.source}</Badge>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* Right pane — race detail */}
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
                                        {displayRace ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <h2 className="text-2xl font-display font-bold">{displayRace.name}</h2>
                                                    {selectedSubrace && (
                                                        <p className="text-sm text-muted-foreground mt-0.5">
                                                            {selectedRace?.name}
                                                        </p>
                                                    )}
                                                    <Badge variant="outline" className="mt-2">{displayRace.source}</Badge>
                                                </div>

                                                <Separator />

                                                <div className="grid grid-cols-3 gap-3">
                                                    <InfoTile title="Ability Bonuses">
                                                        {getASILines(displayRace).length > 0 ? (
                                                            getASILines(displayRace).map((t, i) => (
                                                                <div key={i} className="text-sm font-mono">{t}</div>
                                                            ))
                                                        ) : (
                                                            <span className="text-muted-foreground text-sm">—</span>
                                                        )}
                                                    </InfoTile>
                                                    <InfoTile title="Size">
                                                        <span className="text-sm font-mono">{displayRace.size?.join(', ') ?? '—'}</span>
                                                    </InfoTile>
                                                    <InfoTile title="Speed">
                                                        <span className="text-sm font-mono">{getSpeedText(displayRace)}</span>
                                                    </InfoTile>
                                                </div>

                                                <InfoTile title="Languages">
                                                    <span className="text-sm">{getLanguages(displayRace) || '—'}</span>
                                                </InfoTile>

                                                {getRaceTraits(displayRace).length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">Traits</h4>
                                                        <div className="space-y-3">
                                                            {getRaceTraits(displayRace).map((trait, i) => (
                                                                <div key={i}>
                                                                    <div className="font-semibold text-sm mb-1">{trait.name}</div>
                                                                    <div
                                                                        className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: trait.entries.map((e: any) => renderEntry(e)).join(''),
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Top-level string entries (e.g. intro text) */}
                                                {(displayRace.entries ?? []).filter((e: any) => typeof e === 'string').map((e: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1"
                                                        dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                                                Select a race to view details
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
