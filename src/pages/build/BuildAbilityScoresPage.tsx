import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Barbell,
    ArrowUp,
    ArrowDown,
    Check,
} from '@phosphor-icons/react'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useAbilityScores } from '@/hooks/character/useAbilityScores'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import {
    ABILITY_NAMES,
    ABILITY_ABBREVIATIONS,
    formatModifier,
    normalizeAbilityName,
    type AbilityName,
} from '@/lib/calculations/abilityScores'
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

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildAbilityScoresPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const { races } = useFilteredGameData()
    const {
        scores,
        modifiers,
        modifierStrings,
        setScore,
        setAllScores,
        pointBuyTotal,
        pointBuyRemaining,
    } = useAbilityScores()

    if (!character) {
        return <NoCharCard icon={<Barbell weight="duotone" />} noun="assign ability scores" />
    }

    const method = character.variantRules?.abilityScoreMethod ?? 'standard-array'

    // Build racial bonus map from selected race/subrace
    const selectedRace = races.find((r) =>
        matchesGameDataEntry(character.race, character.raceSource, r),
    ) as Race5e | undefined
    const subraceData = selectedRace?.subraces?.find(
        (sr: Race5e) => sr.name === character.subrace,
    ) as Race5e | undefined
    const displayRace = subraceData ?? selectedRace
    const racialBonuses: Partial<Record<AbilityName, number>> = {}
    for (const block of displayRace?.ability ?? []) {
        for (const [key, val] of Object.entries(block)) {
            if (key !== 'choose' && typeof val === 'number') {
                const full = normalizeAbilityName(key)
                if (full) racialBonuses[full] = (racialBonuses[full] ?? 0) + val
            }
        }
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle className="font-display text-2xl flex items-center gap-3">
                        <Barbell className="h-6 w-6 text-accent" weight="duotone" />
                        Ability Scores
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Method:{' '}
                        <span className="font-semibold text-foreground capitalize">
                            {method.replace('-', ' ')}
                        </span>
                    </p>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue={method}>
                        <TabsList className="mb-6">
                            <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
                            <TabsTrigger value="standard-array">Standard Array</TabsTrigger>
                            <TabsTrigger value="custom">Custom</TabsTrigger>
                        </TabsList>

                        <TabsContent value="point-buy">
                            <PointBuyPanel
                                scores={scores}
                                modifierStrings={modifierStrings}
                                racialBonuses={racialBonuses}
                                pointBuyTotal={pointBuyTotal}
                                pointBuyRemaining={pointBuyRemaining}
                                setScore={setScore}
                            />
                        </TabsContent>

                        <TabsContent value="standard-array">
                            <StandardArrayPanel
                                scores={scores}
                                racialBonuses={racialBonuses}
                                setAllScores={setAllScores}
                            />
                        </TabsContent>

                        <TabsContent value="custom">
                            <CustomScoresPanel
                                scores={scores}
                                modifiers={modifiers}
                                modifierStrings={modifierStrings}
                                racialBonuses={racialBonuses}
                                setScore={setScore}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function PointBuyPanel({
    scores,
    modifierStrings,
    racialBonuses,
    pointBuyTotal,
    pointBuyRemaining,
    setScore,
}: {
    scores: Record<AbilityName, number>
    modifierStrings: Record<AbilityName, string>
    racialBonuses: Partial<Record<AbilityName, number>>
    pointBuyTotal: number
    pointBuyRemaining: number
    setScore: (ability: AbilityName, score: number) => void
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

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {ABILITY_NAMES.map((ability) => {
                    const score = scores[ability] ?? 8
                    const racial = racialBonuses[ability] ?? 0
                    const cost = POINT_BUY_COSTS[score] ?? 0
                    const nextCost = POINT_BUY_COSTS[score + 1] ?? 999

                    return (
                        <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
                            <div className="flex justify-between items-center mb-3">
                                <div>
                                    <div className="text-xs font-bold text-accent uppercase tracking-wider">
                                        {ABILITY_ABBREVIATIONS[ability]}
                                    </div>
                                    <div className="text-xs text-muted-foreground capitalize">{ability}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-bold font-mono">{score + racial}</div>
                                    <div className="text-xs text-muted-foreground">{modifierStrings[ability]}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setScore(ability, Math.max(POINT_BUY_MIN, score - 1))}
                                    disabled={score <= POINT_BUY_MIN}
                                >
                                    <ArrowDown className="h-3 w-3" />
                                </Button>
                                <span className="flex-1 text-center font-mono font-bold">{score}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setScore(ability, Math.min(POINT_BUY_MAX, score + 1))}
                                    disabled={score >= POINT_BUY_MAX || pointBuyRemaining < nextCost - cost}
                                >
                                    <ArrowUp className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="text-xs text-muted-foreground mt-2 text-center">
                                Cost: {cost} pts
                                {racial !== 0 && ` · Racial: ${racial > 0 ? '+' : ''}${racial}`}
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
}: {
    scores: Record<AbilityName, number>
    racialBonuses: Partial<Record<AbilityName, number>>
    setAllScores: (next: Partial<Record<AbilityName, number>>) => void
}) {
    const available = [...STANDARD_ARRAY] as number[]
    const [assignments, setAssignments] = useState<Partial<Record<AbilityName, number>>>(() => {
        const init: Partial<Record<AbilityName, number>> = {}
        for (const ab of ABILITY_NAMES) {
            if (available.includes(scores[ab])) init[ab] = scores[ab]
        }
        return init
    })

    const usedValues = Object.values(assignments).filter((v) => v !== undefined) as number[]

    const getOptions = (forAbility: AbilityName) => {
        const own = assignments[forAbility]
        return available.filter((v) => v === own || !usedValues.includes(v))
    }

    const assign = (ability: AbilityName, raw: string) => {
        const value = raw ? Number(raw) : undefined
        const next = { ...assignments }
        if (value === undefined) delete next[ability]
        else next[ability] = value
        setAssignments(next)
        const update: Partial<Record<AbilityName, number>> = {}
        for (const ab of ABILITY_NAMES) {
            if (next[ab] !== undefined) update[ab] = next[ab] as number
        }
        setAllScores(update)
    }

    const allAssigned = ABILITY_NAMES.every((ab) => assignments[ab] !== undefined)

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 p-4 rounded-lg bg-accent/10 border border-accent/30 items-center">
                <span className="text-sm font-semibold mr-2">Values:</span>
                {available.map((v, i) => {
                    const takenCount = usedValues.filter((x) => x === v).length
                    const totalCount = available.filter((x) => x === v).length
                    return (
                        <Badge
                            key={i}
                            variant={takenCount >= totalCount ? 'secondary' : 'outline'}
                            className="font-mono text-base px-3 py-1"
                        >
                            {v}
                        </Badge>
                    )
                })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {ABILITY_NAMES.map((ability) => {
                    const racial = racialBonuses[ability] ?? 0
                    const base = assignments[ability]
                    const total = base !== undefined ? base + racial : undefined
                    return (
                        <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
                            <div className="text-xs font-bold text-accent uppercase tracking-wider mb-1">
                                {ABILITY_ABBREVIATIONS[ability]}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize mb-3">{ability}</div>
                            <Select
                                value={base !== undefined ? String(base) : ''}
                                onValueChange={(v) => assign(ability, v)}
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Choose…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {getOptions(ability).map((v) => (
                                        <SelectItem key={v} value={String(v)}>
                                            {v} ({formatModifier(getAbilityModifier(v))})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {total !== undefined && (
                                <div className="text-xs text-muted-foreground mt-2">
                                    Total: {total}
                                    {racial !== 0 && ` (racial ${racial > 0 ? '+' : ''}${racial})`}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            {allAssigned && (
                <p className="text-sm text-green-500 flex items-center gap-2">
                    <Check className="h-4 w-4" /> All scores assigned.
                </p>
            )}
        </div>
    )
}

function CustomScoresPanel({
    scores,
    modifiers,
    modifierStrings,
    racialBonuses,
    setScore,
}: {
    scores: Record<AbilityName, number>
    modifiers: Record<AbilityName, number>
    modifierStrings: Record<AbilityName, string>
    racialBonuses: Partial<Record<AbilityName, number>>
    setScore: (ability: AbilityName, score: number) => void
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ABILITY_NAMES.map((ability) => {
                const val = scores[ability] ?? 10
                const racial = racialBonuses[ability] ?? 0
                return (
                    <div key={ability} className="border border-border rounded-lg p-4 bg-card/50">
                        <Label className="text-xs font-bold text-accent uppercase tracking-wider mb-3 block">
                            {ABILITY_ABBREVIATIONS[ability]} — {ability}
                        </Label>
                        <div className="flex items-center gap-3">
                            <Input
                                type="number"
                                min={1}
                                max={30}
                                value={val}
                                className="w-20 text-center font-mono font-bold text-lg"
                                onChange={(e) => {
                                    const n = Math.min(30, Math.max(1, Number(e.target.value) || 1))
                                    setScore(ability, n)
                                }}
                            />
                            <div>
                                <div className="text-lg font-bold font-mono text-accent">
                                    {modifierStrings[ability]}
                                </div>
                                {racial !== 0 && (
                                    <div className="text-xs text-muted-foreground">
                                        Total: {val + racial} (racial {racial > 0 ? '+' : ''}
                                        {racial})
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
