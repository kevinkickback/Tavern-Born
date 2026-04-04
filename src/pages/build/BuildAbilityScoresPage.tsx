import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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
    Barbell,
    CaretLeft,
    CaretRight,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useAbilityScores } from '@/hooks/character/useAbilityScores'
import { useProvenance } from '@/hooks/character/useProvenance'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import {
    ABILITY_NAMES,
    ABILITY_ABBREVIATIONS,
    formatModifier,
    isValidStandardArrayAssignment,
    normalizeAbilityName,
    getRaceAbilityData,
    type AbilityName,
} from '@/lib/calculations/abilityScores'
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills'
import {
    STANDARD_ARRAY,
    POINT_BUY_COSTS,
    POINT_BUY_BUDGET,
    POINT_BUY_MIN,
    POINT_BUY_MAX,
    getAbilityModifier,
} from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import type { Race5e } from '@/types/5etools'
import { NoCharCard } from '@/pages/_shared'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'

const DEFAULT_STANDARD_ARRAY_ASSIGNMENT: Partial<Record<AbilityName, number>> = ABILITY_NAMES.reduce((acc, ability, idx) => {
    acc[ability] = STANDARD_ARRAY[idx] ?? 8
    return acc
}, {} as Partial<Record<AbilityName, number>>)

function formatTitleCase(input: string): string {
    return input.replace(/\b\w/g, (m) => m.toUpperCase())
}

function renderInlineEntry(entry: any): string {
    return renderEntry(entry).replace(/^<p>|<\/p>$/g, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildAbilityScoresPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const gameData = useGameDataStore((s) => s.gameData)
    const { races } = useFilteredGameData()
    const {
        scores,
        setScore,
        setAllScores,
        pointBuyTotal,
        pointBuyRemaining,
    } = useAbilityScores()
    const { getSourcesRowsBySection } = useProvenance()
    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [selectedAbility, setSelectedAbility] = useState<AbilityName>('charisma')

    const method = character?.variantRules?.abilityScoreMethod ?? 'standard-array'

    // Build racial bonus map from selected race/subrace
    const selectedRace = races.find((r) =>
        matchesGameDataEntry(character?.race, character?.raceSource, r),
    ) as Race5e | undefined
    const subraceData = selectedRace?.subraces?.find(
        (sr: Race5e) => sr.name === character?.subrace && (sr.source ?? '') === (character?.subraceSource ?? ''),
    ) as Race5e | undefined
    const raceAsiData = getRaceAbilityData(selectedRace, subraceData)
    const raceAsiChoices: string[][] = character?.raceAsiChoices ?? []

    const racialBonuses: Partial<Record<AbilityName, number>> = {}
    for (const fb of raceAsiData.fixed) {
        racialBonuses[fb.ability] = (racialBonuses[fb.ability] ?? 0) + fb.value
    }
    for (const [blockIdx, block] of raceAsiData.choices.entries()) {
        for (const raw of raceAsiChoices[blockIdx] ?? []) {
            const ab = normalizeAbilityName(raw)
            if (ab) racialBonuses[ab] = (racialBonuses[ab] ?? 0) + block.amount
        }
    }

    const selectedSkills = ALL_SKILLS.filter((skill) => getSkillAbility(skill) === selectedAbility)
    const skillDetailsMap = useMemo(() => {
        const map: Record<string, { name: string; entries: any[]; source?: string; page?: number }> = {}
        const rawSkills = gameData?.skills as any
        const skillsList = Array.isArray(rawSkills)
            ? rawSkills
            : rawSkills
                ? Object.values(rawSkills)
                : []

        for (const skill of skillsList as any[]) {
            if (!skill?.name || !Array.isArray(skill.entries)) continue
            map[String(skill.name).toLowerCase()] = {
                name: skill.name,
                entries: skill.entries,
                source: skill.source,
                page: skill.page,
            }
        }

        return map
    }, [gameData?.skills])

    const selectedSkillDetails = selectedSkills
        .map((skill) => skillDetailsMap[skill.toLowerCase()])
        .filter((v): v is { name: string; entries: any[]; source?: string; page?: number } => Boolean(v))

    const sourceTags = Array.from(
        new Set(
            selectedSkillDetails.map((s) => {
                if (!s.source) return null
                return s.page ? `${s.source}, p. ${s.page}` : s.source
            }).filter((s): s is string => Boolean(s)),
        ),
    )

    if (!character) {
        return <NoCharCard icon={<Barbell weight="duotone" />} noun="assign ability scores" />
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <Barbell className="h-6 w-6 text-accent" weight="duotone" />
                        Ability Scores
                    </h1>
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-6 pb-6">
                <div className="max-w-7xl mx-auto h-full">
                    <Card className="h-full overflow-hidden flex flex-col">
                        <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
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

                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4">
                                        <Tabs defaultValue={method}>
                                            <TabsList className="mb-6">
                                                <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
                                                <TabsTrigger value="standard-array">Standard Array</TabsTrigger>
                                                <TabsTrigger value="custom">Custom</TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="point-buy">
                                                <PointBuyPanel
                                                    scores={scores}
                                                    racialBonuses={racialBonuses}
                                                    pointBuyTotal={pointBuyTotal}
                                                    pointBuyRemaining={pointBuyRemaining}
                                                    setScore={setScore}
                                                    selectedAbility={selectedAbility}
                                                    onSelectAbility={setSelectedAbility}
                                                />
                                            </TabsContent>

                                            <TabsContent value="standard-array">
                                                <StandardArrayPanel
                                                    scores={scores}
                                                    racialBonuses={racialBonuses}
                                                    setAllScores={setAllScores}
                                                    selectedAbility={selectedAbility}
                                                    onSelectAbility={setSelectedAbility}
                                                />
                                            </TabsContent>

                                            <TabsContent value="custom">
                                                <CustomScoresPanel
                                                    scores={scores}
                                                    racialBonuses={racialBonuses}
                                                    setScore={setScore}
                                                    selectedAbility={selectedAbility}
                                                    onSelectAbility={setSelectedAbility}
                                                />
                                            </TabsContent>
                                        </Tabs>

                                        {(raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0) && (
                                            <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border">
                                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Racial Bonuses</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {raceAsiData.fixed.map((fb, i) => (
                                                        <span key={i} className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 font-semibold">
                                                            {ABILITY_ABBREVIATIONS[fb.ability]} +{fb.value}
                                                        </span>
                                                    ))}
                                                    {raceAsiData.choices.map((block, blockIdx) => {
                                                        const selections = raceAsiChoices[blockIdx] ?? []
                                                        return Array.from({ length: block.count }, (_, slotIdx) => {
                                                            const selected = selections[slotIdx] ?? ''
                                                            const takenByOthers = new Set(
                                                                selections.filter((s, si) => si !== slotIdx && s !== '')
                                                            )
                                                            return (
                                                                <div key={`${blockIdx}-${slotIdx}`} className="flex items-center gap-1">
                                                                    <span className="text-xs text-muted-foreground">+{block.amount}</span>
                                                                    <Select value={selected} onValueChange={(v) => {
                                                                        const blockSels = [...(raceAsiChoices[blockIdx] ?? [])]
                                                                        const conflictIdx = blockSels.findIndex((s, si) => si !== slotIdx && s === v)
                                                                        if (conflictIdx >= 0) blockSels[conflictIdx] = blockSels[slotIdx] ?? ''
                                                                        blockSels[slotIdx] = v
                                                                        const newChoices = [...raceAsiChoices]
                                                                        while (newChoices.length <= blockIdx) newChoices.push([])
                                                                        newChoices[blockIdx] = blockSels
                                                                        updateCharacter(character.id, { raceAsiChoices: newChoices })
                                                                    }}>
                                                                        <SelectTrigger className="h-7 w-24 px-2 text-xs">
                                                                            <SelectValue placeholder="Choose\u2026" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {block.from.map((ab) => (
                                                                                <SelectItem
                                                                                    key={ab}
                                                                                    value={ab}
                                                                                    disabled={takenByOthers.has(ab)}
                                                                                    className="text-xs"
                                                                                >
                                                                                    {ABILITY_ABBREVIATIONS[ab]}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            )
                                                        })
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>

                                <div className="px-4 pb-4 border-t border-border">
                                    <SourcesAccordion
                                        sectionId="build-ability-scores"
                                        title="Racial & Bonus Sources"
                                        rows={getSourcesRowsBySection('build-ability-scores')}
                                        emptyText="No ability bonus sources recorded. Select a race to get started."
                                    />
                                </div>
                            </div>

                            <div
                                className={cn(
                                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                                    detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-[40%] min-w-[320px] max-w-[460px]',
                                )}
                            >
                                <div className="p-4 border-b border-border">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Details
                                    </span>
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4 space-y-4">
                                        <div>
                                            <h2 className="text-2xl font-display font-bold">{formatTitleCase(selectedAbility)} Skills</h2>
                                            <p className="text-sm text-muted-foreground mt-1">Skills that use this ability score:</p>
                                        </div>

                                        <Separator />

                                        <div className="space-y-2">
                                            {selectedSkillDetails.length > 0 ? (
                                                <div className="space-y-2">
                                                    {selectedSkillDetails.map((skill) => (
                                                        <div key={skill.name} className="space-y-1">
                                                            <div className="text-base font-semibold">{skill.name}</div>
                                                            <div
                                                                className="text-sm text-muted-foreground"
                                                                dangerouslySetInnerHTML={{
                                                                    __html: skill.entries.map((entry) => renderInlineEntry(entry)).join(' '),
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {sourceTags.length > 0 && (
                                                        <p className="text-sm text-muted-foreground pt-1">
                                                            Source: {sourceTags.join(' ; ')}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {selectedSkills.length > 0
                                                        ? selectedSkills.map(formatTitleCase).join(', ')
                                                        : 'No skills mapped.'}
                                                </p>
                                            )}
                                        </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PointBuyPanel({
    scores,
    racialBonuses,
    pointBuyTotal,
    pointBuyRemaining,
    setScore,
    selectedAbility,
    onSelectAbility,
}: {
    scores: Record<AbilityName, number>
    racialBonuses: Partial<Record<AbilityName, number>>
    pointBuyTotal: number
    pointBuyRemaining: number
    setScore: (ability: AbilityName, score: number) => void
    selectedAbility: AbilityName
    onSelectAbility: (ability: AbilityName) => void
}) {
    const budgetPct = Math.min(100, (pointBuyTotal / POINT_BUY_BUDGET) * 100)

    return (
        <div className="space-y-4">
            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                <div className="flex justify-between text-sm font-semibold mb-2">
                    <span>Points Used</span>
                    <span className={cn(pointBuyRemaining < 0 && 'text-destructive font-bold')}>
                        {pointBuyTotal} / {POINT_BUY_BUDGET}
                        <span className="text-muted-foreground font-normal ml-2">
                            (
                            {pointBuyRemaining >= 0
                                ? `${pointBuyRemaining} remaining`
                                : `${-pointBuyRemaining} over budget`}
                            )
                        </span>
                    </span>
                </div>
                <Progress value={budgetPct} className="h-2" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {ABILITY_NAMES.map((ability) => {
                    const score = scores[ability] ?? 8
                    const racial = racialBonuses[ability] ?? 0
                    const total = score + racial
                    const modifier = formatModifier(getAbilityModifier(total))
                    const cost = POINT_BUY_COSTS[score] ?? 0
                    const nextCost = POINT_BUY_COSTS[score + 1] ?? 999
                    const canDecrease = score > POINT_BUY_MIN
                    const canIncrease = score < POINT_BUY_MAX && pointBuyRemaining >= nextCost - cost

                    return (
                        <div
                            key={ability}
                            onClick={() => onSelectAbility(ability)}
                            className={cn(
                                'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 cursor-pointer transition-colors',
                                selectedAbility === ability ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/60',
                            )}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-accent uppercase tracking-wider">
                                    {ABILITY_ABBREVIATIONS[ability]}
                                </div>
                                {racial !== 0 && <div className="text-sm font-semibold text-emerald-500">{racial > 0 ? '+' : ''}{racial}</div>}
                            </div>
                            <div className="text-center mb-2">
                                <div className="text-3xl font-bold font-mono leading-none">{total}</div>
                                <div className="text-xl font-semibold mt-1">{modifier}</div>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        'h-8 w-8 p-0 text-base font-bold',
                                        canDecrease
                                            ? 'border-accent/45 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60'
                                            : 'opacity-35 cursor-not-allowed',
                                    )}
                                    onClick={() => setScore(ability, Math.max(POINT_BUY_MIN, score - 1))}
                                    disabled={!canDecrease}
                                >
                                    -
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        'h-8 w-8 p-0 text-base font-bold',
                                        canIncrease
                                            ? 'border-accent/45 bg-accent/5 text-accent hover:bg-accent/10 hover:border-accent/60'
                                            : 'opacity-35 cursor-not-allowed',
                                    )}
                                    onClick={() => setScore(ability, Math.min(POINT_BUY_MAX, score + 1))}
                                    disabled={!canIncrease}
                                >
                                    +
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function StandardArrayPanel({
    scores,
    racialBonuses,
    setAllScores,
    selectedAbility,
    onSelectAbility,
}: {
    scores: Record<AbilityName, number>
    racialBonuses: Partial<Record<AbilityName, number>>
    setAllScores: (next: Partial<Record<AbilityName, number>>) => void
    selectedAbility: AbilityName
    onSelectAbility: (ability: AbilityName) => void
}) {
    const available = [...STANDARD_ARRAY] as number[]
    const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>({ ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT })

    useEffect(() => {
        if (isValidStandardArrayAssignment(scores)) {
            const next: Partial<Record<AbilityName, number>> = {}
            for (const ab of ABILITY_NAMES) next[ab] = scores[ab]
            setAssignments(next)
            return
        }

        const fallback = { ...DEFAULT_STANDARD_ARRAY_ASSIGNMENT }
        setAssignments(fallback)
        setAllScores(fallback)
    }, [scores, setAllScores])

    const assign = (ability: AbilityName, raw: string) => {
        const value = Number(raw)
        if (!Number.isFinite(value)) return
        const next = { ...assignments }
        const current = next[ability]
        const otherAbility = ABILITY_NAMES.find((ab) => ab !== ability && next[ab] === value)

        // If target value is already assigned, swap values so users can reassign in one step.
        if (otherAbility) {
            next[otherAbility] = current ?? (available[0] ?? 8)
        }

        next[ability] = value
        setAssignments(next)
        const update: Partial<Record<AbilityName, number>> = {}
        for (const ab of ABILITY_NAMES) {
            if (next[ab] !== undefined) update[ab] = next[ab] as number
        }
        setAllScores(update)
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {ABILITY_NAMES.map((ability) => {
                    const racial = racialBonuses[ability] ?? 0
                    const base = assignments[ability]
                    const total = base !== undefined ? base + racial : undefined
                    const modifier = total !== undefined ? formatModifier(getAbilityModifier(total)) : '—'
                    return (
                        <div
                            key={ability}
                            onClick={() => onSelectAbility(ability)}
                            className={cn(
                                'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 cursor-pointer transition-colors',
                                selectedAbility === ability ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/60',
                            )}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-bold text-accent uppercase tracking-wider">
                                    {ABILITY_ABBREVIATIONS[ability]}
                                </div>
                                {racial !== 0 && <div className="text-sm font-semibold text-emerald-500">{racial > 0 ? '+' : ''}{racial}</div>}
                            </div>
                            <div className="text-center mb-2">
                                <div className="text-3xl font-bold font-mono leading-none">{total ?? '—'}</div>
                                <div className="text-xl font-semibold mt-1">{modifier}</div>
                            </div>
                            <div className="flex justify-center">
                                <Select
                                    value={base !== undefined ? String(base) : ''}
                                    onValueChange={(v) => assign(ability, v)}
                                >
                                    <SelectTrigger className="h-9 w-[84px] px-2 text-sm [&_span]:truncate">
                                        <SelectValue placeholder="Choose…" />
                                    </SelectTrigger>
                                    <SelectContent className="w-[84px] min-w-[84px]">
                                        {available.map((v) => (
                                            <SelectItem
                                                key={v}
                                                value={String(v)}
                                                className="pr-6"
                                            >
                                                {v}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function CustomScoresPanel({
    scores,
    racialBonuses,
    setScore,
    selectedAbility,
    onSelectAbility,
}: {
    scores: Record<AbilityName, number>
    racialBonuses: Partial<Record<AbilityName, number>>
    setScore: (ability: AbilityName, score: number) => void
    selectedAbility: AbilityName
    onSelectAbility: (ability: AbilityName) => void
}) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ABILITY_NAMES.map((ability) => {
                const val = scores[ability] ?? 10
                const racial = racialBonuses[ability] ?? 0
                const total = val + racial
                const modifier = formatModifier(getAbilityModifier(total))
                return (
                    <div
                        key={ability}
                        onClick={() => onSelectAbility(ability)}
                        className={cn(
                            'w-full max-w-[320px] mx-auto border rounded-lg p-4 bg-card/50 cursor-pointer transition-colors',
                            selectedAbility === ability ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/60',
                        )}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-bold text-accent uppercase tracking-wider">
                                {ABILITY_ABBREVIATIONS[ability]}
                            </div>
                            {racial !== 0 && <div className="text-sm font-semibold text-emerald-500">{racial > 0 ? '+' : ''}{racial}</div>}
                        </div>
                        <div className="text-center mb-2">
                            <div className="text-3xl font-bold font-mono leading-none">{total}</div>
                            <div className="text-xl font-semibold mt-1">{modifier}</div>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <Input
                                type="number"
                                min={1}
                                max={30}
                                value={val}
                                className="h-10 w-24 text-center font-mono font-bold text-base"
                                onChange={(e) => {
                                    const n = Math.min(30, Math.max(1, Number(e.target.value) || 1))
                                    setScore(ability, n)
                                }}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
