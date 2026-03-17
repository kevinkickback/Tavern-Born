import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Sword,
    Star,
    Check,
    CaretLeft,
    CaretRight,
    MagicWand,
    Sparkle,
} from '@phosphor-icons/react'
import { renderEntry } from '@/lib/renderer'
import { useCharacterStore } from '@/store/characterStore'
import { useFilteredGameData } from '@/hooks/useFilteredGameData'
import { SpellSelectionModal } from '@/components/character/SpellSelectionModal'
import { OptionalFeatureSelectionModal } from '@/components/character/OptionalFeatureSelectionModal'
import { SubclassSelectionModal } from '@/components/character/SubclassSelectionModal'
import type { CategoryLimit, ActiveFilters } from '@/components/ui/SelectionModal'
import type { PrereqCharacterSnapshot } from '@/lib/prerequisites'
import type { Spell5e } from '@/types/5etools'
import { formatSpellLevel, getSchoolName } from '@/lib/spellUtils'
import {
    getASILevelsFromClass,
    getProficiencyBonus,
} from '@/lib/gameRules'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import { NoCharCard, InfoTile } from '@/pages/_shared'
import { normalizeAbilityName } from '@/lib/abilityScores'
import { matchesGameDataEntry } from '@/lib/characterUtils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** How many cantrips / spells are gained at a given class level. */
function getSpellGainAtLevel(
    classData: Class5e | undefined,
    level: number,
): { cantrips: number; spells: number; maxSpellLevel: number } {
    const d = classData as any
    if (!d?.spellcastingAbility) return { cantrips: 0, spells: 0, maxSpellLevel: 0 }

    const cantripProg: number[] | undefined = d.cantripProgression
    const spellsFixed: number[] | undefined = d.spellsKnownProgressionFixed
    const spellsKnown: number[] | undefined = d.spellsKnownProgression

    const idx = level - 1
    const prevIdx = level - 2

    const cantripsNow = cantripProg ? (cantripProg[idx] ?? 0) : 0
    const cantripsPrev = cantripProg && level > 1 ? (cantripProg[prevIdx] ?? 0) : 0
    const newCantrips = Math.max(0, cantripsNow - cantripsPrev)

    let newSpells = 0
    if (spellsFixed) {
        newSpells = spellsFixed[idx] ?? 0
    } else if (spellsKnown) {
        const spellsNow = spellsKnown[idx] ?? 0
        const spellsPrev = level > 1 ? (spellsKnown[prevIdx] ?? 0) : 0
        newSpells = Math.max(0, spellsNow - spellsPrev)
    }

    // Approximate max learnable spell level for display
    const cp = d.casterProgression
    let maxSpellLevel = 0
    if (cp === 'full') maxSpellLevel = Math.min(9, Math.ceil(level / 2))
    else if (cp === '1/2') maxSpellLevel = Math.min(5, Math.ceil((level - 1) / 2))
    else if (cp === '1/3') maxSpellLevel = Math.min(4, Math.ceil((level - 1) / 3))
    else if (cp === 'pact') maxSpellLevel = Math.min(5, Math.ceil(level / 2))

    return { cantrips: newCantrips, spells: newSpells, maxSpellLevel }
}

// ─── Optional feature progression helpers ────────────────────────────────────

interface OptFeatureProg {
    name: string
    featureType: string[]
    progression: number[] | Record<string, number>
}

/** Total optional features of this type allowed at the given class level. */
function getOptFeatureTotal(
    prog: number[] | Record<string, number>,
    level: number,
): number {
    if (Array.isArray(prog)) return prog[Math.max(0, level - 1)] ?? 0
    let total = 0
    for (const [k, v] of Object.entries(prog)) {
        if (Number(k) <= level) total = Math.max(total, Number(v))
    }
    return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildClassPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const updateCharacter = useCharacterStore((s) => s.updateCharacter)
    const { classes, classFeatures, optionalfeatures, spells } = useFilteredGameData()
    // Dialog / panel state
    const [selectedClassTab, setSelectedClassTab] = useState('')
    const [classPickerOpen, setClassPickerOpen] = useState(false)
    const [classPickerSearch, setClassPickerSearch] = useState('')
    const [subclassPickerOpen, setSubclassPickerOpen] = useState(false)
    const [spellPickerLevel, setSpellPickerLevel] = useState<number | null>(null)
    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [selectedFeature, setSelectedFeature] = useState<{ name: string; source?: string; entries: any[]; levelFeatures?: { level: number; features: any[] }[] } | null>(null)
    const [optPickerState, setOptPickerState] = useState<{ progName: string; featureTypes: string[]; total: number } | null>(null)

    if (!character) {
        return <NoCharCard icon={<Sword weight="duotone" />} noun="configure your class" />
    }

    // ── Multiclass progression ────────────────────────────────────────────────
    const classProgression = character.classProgression?.length
        ? character.classProgression
        : character.class
            ? [{ name: character.class, source: character.classSource, levels: character.level }]
            : []

    const viewingEntry = classProgression.find((e) => e.name === selectedClassTab) ?? classProgression[0]
    const viewingClass = viewingEntry?.name ?? character.class
    const viewingClassSource = viewingEntry?.source ?? character.classSource
    const viewingClassLevel = viewingEntry?.levels ?? character.level

    const viewingClassData = classes.find((c) =>
        matchesGameDataEntry(viewingClass, viewingClassSource, c),
    ) as Class5e | undefined

    const handleClassChange = (className: string, classSource?: string) => {
        const cls = classes.find((c) =>
            matchesGameDataEntry(className, classSource, c),
        ) as Class5e | undefined
        updateCharacter(character.id, {
            class: className,
            classSource: classSource ?? undefined,
            subclass: undefined,
            proficiencyBonus: getProficiencyBonus(character.level),
            proficiencies: {
                ...character.proficiencies,
                armor: [...new Set([...character.proficiencies.armor, ...(cls?.startingProficiencies?.armor ?? [])])],
                weapons: [...new Set([...character.proficiencies.weapons, ...(cls?.startingProficiencies?.weapons ?? [])])],
                tools: [...new Set([...character.proficiencies.tools, ...(cls?.startingProficiencies?.tools ?? [])])],
            },
            spells: {
                ...character.spells,
                spellcastingAbility: cls?.spellcastingAbility
                    ? (normalizeAbilityName(cls.spellcastingAbility) ?? cls.spellcastingAbility.toLowerCase())
                    : character.spells?.spellcastingAbility,
            },
        })
        setSelectedFeature(null)
        setClassPickerOpen(false)
        setClassPickerSearch('')
    }

    // ── Class features for current class ─────────────────────────────────────
    const allClassFeatures = useMemo(() => {
        if (!viewingClass) return []
        const src = viewingClassSource ?? viewingClassData?.source
        return classFeatures
            .filter((f) => f.className === viewingClass && (!src || f.classSource === src))
            .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    }, [classFeatures, viewingClass, viewingClassSource, viewingClassData])

    const featuresByLevel = useMemo(() => {
        const map = new Map<number, typeof allClassFeatures>()
        for (const f of allClassFeatures) {
            const lv = f.level ?? 0
            if (!map.has(lv)) map.set(lv, [])
            map.get(lv)!.push(f)
        }
        return map
    }, [allClassFeatures])

    // ── Subclass unlock level (from gainSubclassFeature flag on features) ─────
    const subclassLevel = useMemo(() => {
        const f = allClassFeatures.find((f: any) => f.gainSubclassFeature === true)
        return f?.level ?? 3
    }, [allClassFeatures])

    // ── ASI levels for this class ─────────────────────────────────────────────
    const asiLevels = getASILevelsFromClass(viewingClassData)

    // ── Optional feature choices (Invocations, Metamagic, etc.) ─────────────────
    const optFeatures = optionalfeatures ?? []

    const selectedNames = new Set((character.features ?? []).map((f) => f.name))

    const handleOptFeatureConfirm = (names: string[], featureTypes: string[]) => {
        // Keep features that belong to other types (spells, class features, feats, etc.).
        const existingNonOpt = character.features.filter((f) => {
            const of = (optFeatures as any[]).find((o: any) => o.name === f.name)
            if (!of) return true
            const fTypes: string[] = Array.isArray(of.featureType)
                ? of.featureType
                : [of.featureType ?? '']
            return !featureTypes.some((t) => fTypes.includes(t))
        })
        const newFeatures = names.map((name) => {
            const feat = (optFeatures as any[]).find((f: any) => f.name === name)
            return {
                id: `${name}-opt`,
                name,
                source: (feat as any)?.source ?? '',
                description: '',
            }
        })
        updateCharacter(character.id, { features: [...existingNonOpt, ...newFeatures] })
    }

    // ── Spell choices per level (cantrips / spells gained) ───────────────────────
    const spellChoicesByLevel = useMemo(() => {
        const map = new Map<number, { cantrips: number; spells: number; maxSpellLevel: number }>()
        if (!viewingClassData) return map
        for (let lv = 1; lv <= 20; lv++) {
            const gain = getSpellGainAtLevel(viewingClassData, lv)
            if (gain.cantrips > 0 || gain.spells > 0) map.set(lv, gain)
        }
        return map
    }, [viewingClassData])

    // ── Optional feature progression (Invocations, Fighting Styles, Metamagic…) ─
    const optFeatureProgressions = useMemo(
        () => ((viewingClassData as any)?.optionalfeatureProgression ?? []) as OptFeatureProg[],
        [viewingClassData],
    )

    // ── Levels to show in accordion (1..character.level that have content) ────
    const levelsToShow = useMemo(() => {
        const set = new Set<number>()
        allClassFeatures.forEach((f) => { if (f.level && f.level <= viewingClassLevel) set.add(f.level) })
        asiLevels.filter((l) => l <= viewingClassLevel).forEach((l) => set.add(l))
        if (subclassLevel <= viewingClassLevel) set.add(subclassLevel)
        spellChoicesByLevel.forEach((_, lv) => { if (lv <= viewingClassLevel) set.add(lv) })
        for (const prog of optFeatureProgressions) {
            for (let lv = 1; lv <= viewingClassLevel; lv++) {
                if (getOptFeatureTotal(prog.progression, lv) > getOptFeatureTotal(prog.progression, lv - 1))
                    set.add(lv)
            }
        }
        return Array.from(set).sort((a, b) => a - b)
    }, [allClassFeatures, asiLevels, subclassLevel, viewingClassLevel, spellChoicesByLevel, optFeatureProgressions])

    // ── Subclasses for the picker dialog ─────────────────────────────────────
    const subclasses = (viewingClassData as any)?.subclasses ?? []

    // ── Subclass for the currently-viewed class (multiclass-aware) ───────────
    const viewingSubclass = viewingEntry
        ? (classProgression.length > 1
            ? viewingEntry.subclass
            : (viewingEntry.subclass ?? character.subclass))
        : character.subclass

    const handleSubclassSelect = (sc: any) => {
        if (classProgression.length > 0 && viewingEntry) {
            const newProg = classProgression.map((e) =>
                e.name === viewingEntry.name && (e.source ?? '') === (viewingEntry.source ?? '')
                    ? { ...e, subclass: sc.name, subclassSource: sc.source ?? undefined }
                    : e,
            )
            const updates: Record<string, any> = { classProgression: newProg }
            // Keep top-level character.subclass in sync for the primary class.
            if (viewingEntry.name === character.class) {
                updates.subclass = sc.name
                updates.subclassSource = sc.source ?? undefined
            }
            updateCharacter(character.id, updates)
        } else {
            updateCharacter(character.id, {
                subclass: sc.name,
                subclassSource: sc.source ?? undefined,
            })
        }
        setSelectedFeature({ name: sc.name, source: sc.source, entries: sc.entries ?? [], levelFeatures: sc.levelFeatures })
        setSubclassPickerOpen(false)
        if (detailCollapsed) setDetailCollapsed(false)
    }

    // ── Character snapshot for prerequisite checking ───────────────────────
    const characterSnapshot: PrereqCharacterSnapshot = {
        level: character.level,
        class: viewingClass,
        race: character.race,
        abilityScores: character.abilityScores as any,
        features: character.features ?? [],
        spells: {
            cantrips: character.spells?.cantrips ?? [],
            spellsKnown: character.spells?.spellsKnown ?? [],
            preparedSpells: character.spells?.preparedSpells ?? [],
        },
        ...(classProgression.length > 0
            ? {
                progression: {
                    classes: classProgression.map((e) => ({
                        name: e.name,
                        levels: e.levels,
                        source: e.source,
                    })),
                },
            }
            : {}),
    }

    // ── Filtered class list for the picker dialog ─────────────────────────────
    const filteredClasses = useMemo(
        () => classes.filter((c) => !classPickerSearch || c.name.toLowerCase().includes(classPickerSearch.toLowerCase())),
        [classes, classPickerSearch],
    )

    // ── Spells pre-filtered to viewing class (passed to the spell picker) ────
    // Reduces array from ~1255 to ~100-200 before it reaches the modal,
    // cutting both filter cost and initial card render count.
    const classSpells = useMemo(() => {
        const classLower = viewingClass?.toLowerCase()
        if (!classLower) return spells as Spell5e[]
        return (spells as Spell5e[]).filter((s) => {
            const fromList = s.classes?.fromClassList ?? []
            return fromList.length === 0 || fromList.some((c: any) => c.name?.toLowerCase() === classLower)
        })
    }, [spells, viewingClass])

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <Sword className="h-6 w-6 text-accent" weight="duotone" />
                        Class
                    </h1>
                </div>
            </div>

            <div className="flex-1 overflow-hidden px-6 pb-6">
                <div className="max-w-7xl mx-auto h-full">
                    <Card className="h-full overflow-hidden flex flex-col">
                        <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">

                            {/* Toggle detail panel */}
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

                            {/* ── Left pane: multiclass tabs (when applicable) + feature accordion ── */}
                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

                                {/* Left pane header */}
                                <div className="p-4 border-b border-border flex-shrink-0">
                                    {classProgression.length > 1 ? (
                                        <Tabs
                                            value={selectedClassTab || classProgression[0]?.name}
                                            onValueChange={(v) => { setSelectedClassTab(v); setSelectedFeature(null) }}
                                        >
                                            <TabsList className="w-full">
                                                {classProgression.map((entry) => (
                                                    <TabsTrigger
                                                        key={`${entry.name}|${entry.source ?? ''}`}
                                                        value={entry.name}
                                                        className="flex-1 gap-1.5 text-xs"
                                                    >
                                                        {entry.name}
                                                        <Badge variant="secondary" className="font-mono h-4 px-1 text-[10px] pointer-events-none">
                                                            {entry.levels}
                                                        </Badge>
                                                    </TabsTrigger>
                                                ))}
                                            </TabsList>
                                        </Tabs>
                                    ) : (
                                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                            {character.class ? `${character.class} Features` : 'Class Features'}
                                        </span>
                                    )}
                                </div>

                                {/* Level feature accordion */}
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4">
                                        {!character.class ? (
                                            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
                                                <Sword className="h-8 w-8 opacity-30" weight="duotone" />
                                                <p className="text-sm">No class selected</p>
                                                <Button size="sm" onClick={() => setClassPickerOpen(true)}>Choose a Class</Button>
                                            </div>
                                        ) : levelsToShow.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">No feature data available</p>
                                        ) : (
                                            <>
                                                <Accordion type="multiple" defaultValue={[`level-${character.level}`]}>
                                                    {levelsToShow.map((lv) => {
                                                        const isSubclassLevel = lv === subclassLevel
                                                        const isASILevel = (asiLevels as readonly number[]).includes(lv)
                                                        const spellGain = spellChoicesByLevel.get(lv)

                                                        const optFeatureGainsAtLevel = optFeatureProgressions.filter(
                                                            (prog) =>
                                                                getOptFeatureTotal(prog.progression, lv) >
                                                                getOptFeatureTotal(prog.progression, lv - 1),
                                                        )

                                                        // Passive features: exclude the subclass unlock entry and ASI entries
                                                        // since those are surfaced as dedicated choice rows
                                                        const passiveFeatures = (featuresByLevel.get(lv) ?? []).filter((f: any) => {
                                                            if (isSubclassLevel && f.gainSubclassFeature) return false
                                                            if (isASILevel && f.name === 'Ability Score Improvement') return false
                                                            return true
                                                        })

                                                        const choiceCount =
                                                            (isSubclassLevel ? 1 : 0) +
                                                            (isASILevel ? 1 : 0) +
                                                            (spellGain ? 1 : 0) +
                                                            optFeatureGainsAtLevel.length
                                                        const totalCount = passiveFeatures.length + choiceCount

                                                        return (
                                                            <AccordionItem key={lv} value={`level-${lv}`}>
                                                                <AccordionTrigger className="text-sm px-1 hover:no-underline">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-semibold">Level {lv} Features</span>
                                                                        {totalCount > 0 && (
                                                                            <Badge variant="secondary" className="text-xs font-mono h-5 px-1.5 pointer-events-none">
                                                                                {totalCount}
                                                                            </Badge>
                                                                        )}
                                                                        {choiceCount > 0 && (
                                                                            <Badge className="text-xs h-5 px-1.5 pointer-events-none bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">
                                                                                {choiceCount} {choiceCount === 1 ? 'choice' : 'choices'}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </AccordionTrigger>
                                                                <AccordionContent>
                                                                    <div className="space-y-1.5 pt-1 pb-2 px-1">

                                                                        {/* Subclass choice row */}
                                                                        {isSubclassLevel && (
                                                                            <div className={cn(
                                                                                'rounded-lg border overflow-hidden',
                                                                                viewingSubclass
                                                                                    ? 'border-green-500/30 bg-green-500/5'
                                                                                    : 'border-amber-500/30 bg-amber-500/5',
                                                                            )}>
                                                                                <div className="flex items-center justify-between px-3 py-2.5">
                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                        <Star className="h-4 w-4 text-accent flex-shrink-0" weight="duotone" />
                                                                                        <div className="min-w-0">
                                                                                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                                                                                                {viewingSubclass
                                                                                                    ? (viewingClassData as any)?.subclassTitle ?? 'Subclass'
                                                                                                    : 'Subclass Selection'}
                                                                                                {viewingSubclass && (
                                                                                                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="text-xs text-muted-foreground">
                                                                                                {viewingSubclass
                                                                                                    ? `${(viewingClassData as any)?.subclassTitle ?? 'Subclass'} chosen`
                                                                                                    : 'None selected'}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <Button
                                                                                        variant={viewingSubclass ? 'outline' : 'default'}
                                                                                        size="sm"
                                                                                        className="flex-shrink-0 ml-2 h-7 text-xs"
                                                                                        onClick={() => setSubclassPickerOpen(true)}
                                                                                    >
                                                                                        {viewingSubclass ? 'Change' : 'Choose'}
                                                                                    </Button>
                                                                                </div>
                                                                                {viewingSubclass && (() => {
                                                                                    const sc = subclasses.find((s: any) => s.name === viewingSubclass)
                                                                                    return (
                                                                                        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-green-500/20 pt-2">
                                                                                            <button
                                                                                                type="button"
                                                                                                onMouseEnter={() => {
                                                                                                    setSelectedFeature({
                                                                                                        name: viewingSubclass,
                                                                                                        source: sc?.source,
                                                                                                        entries: sc?.entries ?? [],
                                                                                                        levelFeatures: sc?.levelFeatures,
                                                                                                    })
                                                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                                                }}
                                                                                                onClick={() =>
                                                                                                    setSelectedFeature({
                                                                                                        name: viewingSubclass,
                                                                                                        source: sc?.source,
                                                                                                        entries: sc?.entries ?? [],
                                                                                                        levelFeatures: sc?.levelFeatures,
                                                                                                    })
                                                                                                }
                                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-green-500/30 bg-green-500/5 hover:border-green-500/50 hover:bg-green-500/15 text-foreground transition-colors"
                                                                                            >
                                                                                                <span className="font-medium">{viewingSubclass}</span>
                                                                                            </button>
                                                                                        </div>
                                                                                    )
                                                                                })()}
                                                                            </div>
                                                                        )}

                                                                        {/* Optional feature choice rows (Invocations, Fighting Styles, Metamagic…) */}
                                                                        {optFeatureGainsAtLevel.map((prog) => {
                                                                            const totalAllowed = getOptFeatureTotal(
                                                                                prog.progression,
                                                                                viewingClassLevel,
                                                                            )
                                                                            const featuresOfType = (optFeatures as any[]).filter(
                                                                                (f: any) => {
                                                                                    const fTypes: string[] = Array.isArray(f.featureType)
                                                                                        ? f.featureType
                                                                                        : [f.featureType ?? '']
                                                                                    return prog.featureType.some((t) =>
                                                                                        fTypes.includes(t),
                                                                                    )
                                                                                },
                                                                            )
                                                                            const selectedCount = featuresOfType.filter((f: any) =>
                                                                                selectedNames.has(f.name),
                                                                            ).length
                                                                            const isFull = selectedCount >= totalAllowed
                                                                            const chosenFeatures = featuresOfType.filter((f: any) =>
                                                                                selectedNames.has(f.name),
                                                                            )
                                                                            return (
                                                                                <div
                                                                                    key={prog.name}
                                                                                    className={cn(
                                                                                        'rounded-lg border overflow-hidden',
                                                                                        isFull
                                                                                            ? 'border-green-500/30 bg-green-500/5'
                                                                                            : 'border-amber-500/30 bg-amber-500/5',
                                                                                    )}
                                                                                >
                                                                                    <div className="flex items-center justify-between px-3 py-2.5">
                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                            <Sparkle
                                                                                                className="h-4 w-4 text-accent flex-shrink-0"
                                                                                                weight="duotone"
                                                                                            />
                                                                                            <div className="min-w-0">
                                                                                                <div className="flex items-center gap-1.5 text-sm font-semibold">
                                                                                                    {prog.name}
                                                                                                    {isFull && (
                                                                                                        <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="text-xs text-muted-foreground">
                                                                                                    {selectedCount} / {totalAllowed} chosen
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Button
                                                                                            variant={selectedCount > 0 ? 'outline' : 'default'}
                                                                                            size="sm"
                                                                                            className="flex-shrink-0 ml-2 h-7 text-xs"
                                                                                            onClick={() =>
                                                                                                setOptPickerState({
                                                                                                    progName: prog.name,
                                                                                                    featureTypes: prog.featureType,
                                                                                                    total: totalAllowed,
                                                                                                })
                                                                                            }
                                                                                        >
                                                                                            {selectedCount > 0 ? 'Edit' : 'Choose'}
                                                                                        </Button>
                                                                                    </div>
                                                                                    {chosenFeatures.length > 0 && (
                                                                                        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-green-500/20 pt-2">
                                                                                            {chosenFeatures.map((feat: any) => (
                                                                                                <button
                                                                                                    key={feat.name}
                                                                                                    type="button"
                                                                                                    onMouseEnter={() => {
                                                                                                        setSelectedFeature({ name: feat.name, source: feat.source, entries: feat.entries ?? [] })
                                                                                                        if (detailCollapsed) setDetailCollapsed(false)
                                                                                                    }}
                                                                                                    onClick={() => {
                                                                                                        setSelectedFeature({ name: feat.name, source: feat.source, entries: feat.entries ?? [] })
                                                                                                        if (detailCollapsed) setDetailCollapsed(false)
                                                                                                    }}
                                                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-green-500/30 bg-green-500/5 hover:border-green-500/50 hover:bg-green-500/15 text-foreground transition-colors"
                                                                                                >
                                                                                                    <span className="font-medium">{feat.name}</span>
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}

                                                                        {/* ASI / Feat row */}
                                                                        {isASILevel && (
                                                                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5">
                                                                                <Star className="h-4 w-4 text-blue-400 flex-shrink-0" weight="duotone" />
                                                                                <div>
                                                                                    <div className="text-sm font-semibold">Ability Score Improvement</div>
                                                                                    <div className="text-xs text-muted-foreground">ASI or Feat — configure in Ability Scores</div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Spell selection row */}
                                                                        {spellGain && (() => {
                                                                            const levelKey = `${viewingClass}:${lv}`
                                                                            const chosenNames = character.spellsByLevel?.[levelKey] ?? []
                                                                            return (
                                                                                <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 overflow-hidden">
                                                                                    <div className="flex items-center justify-between px-3 py-2.5">
                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                            <MagicWand className="h-4 w-4 text-purple-400 flex-shrink-0" weight="duotone" />
                                                                                            <div className="min-w-0">
                                                                                                <div className="text-sm font-semibold">Spell Selection</div>
                                                                                                <div className="text-xs text-muted-foreground">
                                                                                                    {[
                                                                                                        spellGain.cantrips > 0 && `${spellGain.cantrips} cantrip${spellGain.cantrips > 1 ? 's' : ''}`,
                                                                                                        spellGain.spells > 0 && `${spellGain.spells} spell${spellGain.spells > 1 ? 's' : ''}${spellGain.maxSpellLevel > 0 ? ` (up to ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][spellGain.maxSpellLevel - 1] ?? spellGain.maxSpellLevel + 'th'}-level)` : ''}`,
                                                                                                    ].filter(Boolean).join(' · ')}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Button
                                                                                            variant={chosenNames.length > 0 ? 'outline' : 'default'}
                                                                                            size="sm"
                                                                                            className="flex-shrink-0 ml-2 h-7 text-xs"
                                                                                            onClick={() => setSpellPickerLevel(lv)}
                                                                                        >
                                                                                            {chosenNames.length > 0 ? 'Edit' : 'Choose'}
                                                                                        </Button>
                                                                                    </div>
                                                                                    {/* Chosen spells for this level */}
                                                                                    {chosenNames.length > 0 && (
                                                                                        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-purple-500/20 pt-2">
                                                                                            {chosenNames.map((name) => {
                                                                                                const spell = (spells as Spell5e[]).find((s) => s.name === name)
                                                                                                return (
                                                                                                    <button
                                                                                                        key={name}
                                                                                                        type="button"
                                                                                                        onMouseEnter={() => {
                                                                                                            if (spell) {
                                                                                                                setSelectedFeature({ name: spell.name, source: spell.source, entries: spell.entries ?? [] })
                                                                                                                if (detailCollapsed) setDetailCollapsed(false)
                                                                                                            }
                                                                                                        }}
                                                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 hover:bg-purple-500/15 text-foreground transition-colors"
                                                                                                    >
                                                                                                        <span className="font-medium">{name}</span>
                                                                                                        {spell && (
                                                                                                            <span className="text-muted-foreground opacity-80">{formatSpellLevel(spell.level)}</span>
                                                                                                        )}
                                                                                                    </button>
                                                                                                )
                                                                                            })}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })()}

                                                                        {/* Passive features */}
                                                                        {passiveFeatures.map((f: any, i: number) => (
                                                                            <button
                                                                                key={`${f.name}|${f.source ?? ''}`}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setSelectedFeature({ name: f.name, source: f.source, entries: f.entries ?? [] })
                                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                                }}
                                                                                className={cn(
                                                                                    'w-full text-left px-3 py-2 rounded-md hover:bg-accent/10 hover:text-accent transition-colors group flex items-center justify-between',
                                                                                    selectedFeature?.name === f.name && 'bg-accent/10 text-accent',
                                                                                )}
                                                                            >
                                                                                <span className="text-sm font-medium">{f.name}</span>
                                                                                {(f.entries ?? []).length > 0 && (
                                                                                    <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </AccordionContent>
                                                            </AccordionItem>
                                                        )
                                                    })}
                                                </Accordion>


                                            </>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* ── Right pane: feature detail panel ───────────────────────── */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                                    detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-1/2 min-w-[320px]',
                                )}
                            >
                                <div className="p-4 border-b border-border flex-shrink-0">
                                    {selectedFeature ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedFeature(null)}
                                                className="text-xs text-accent hover:underline flex items-center gap-1 mb-2"
                                            >
                                                <CaretLeft className="h-3 w-3" /> All features
                                            </button>
                                            <h3 className="text-lg font-display font-bold">{selectedFeature.name}</h3>
                                            {selectedFeature.source && (
                                                <span className="text-xs text-muted-foreground">Source: {selectedFeature.source}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</span>
                                    )}
                                </div>
                                {selectedFeature ? (
                                    <ScrollArea className="flex-1 overflow-hidden">
                                        <div className="p-4 space-y-4">
                                            {selectedFeature.levelFeatures ? (
                                                // ── Rich subclass detail view ──────────────────────────
                                                <>
                                                    {/* Intro description */}
                                                    {selectedFeature.entries.filter((e: any) => typeof e === 'string').map((e: any, i: number) => (
                                                        <p key={i} className="text-sm text-muted-foreground leading-relaxed">{e}</p>
                                                    ))}
                                                    {selectedFeature.levelFeatures
                                                        .slice()
                                                        .sort((a, b) => a.level - b.level)
                                                        .map(({ level, features }) => (
                                                            <div key={level}>
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <Badge variant="outline" className="text-xs font-mono flex-shrink-0">Level {level}</Badge>
                                                                    <div className="flex-1 h-px bg-border" />
                                                                </div>
                                                                <div className="space-y-4">
                                                                    {features.map((feat: any) => (
                                                                        <div key={`${feat.name}|${feat.source ?? ''}`}>
                                                                            <div className="text-sm font-semibold mb-1">{feat.name}</div>
                                                                            {feat.entries?.map((e: any, i: number) => (
                                                                                <div
                                                                                    key={i}
                                                                                    className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                                                                                    dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                                                />
                                                                            ))}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </>
                                            ) : (
                                                // ── Standard feature / spell / invocation view ──────────
                                                selectedFeature.entries.length > 0 ? (
                                                    selectedFeature.entries.map((e: any, i: number) => (
                                                        <div
                                                            key={i}
                                                            className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                                                            dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                        />
                                                    ))
                                                ) : (
                                                    <p className="text-sm text-muted-foreground italic">No description available.</p>
                                                )
                                            )}
                                        </div>
                                    </ScrollArea>
                                ) : viewingClassData ? (
                                    <ScrollArea className="flex-1 overflow-hidden">
                                        <div className="p-4 space-y-4">
                                            <div>
                                                <h2 className="text-2xl font-display font-bold">{viewingClassData.name}</h2>
                                                <Badge variant="outline" className="mt-2">{viewingClassData.source}</Badge>
                                            </div>

                                            <Separator />

                                            <div className="grid grid-cols-3 gap-3">
                                                <InfoTile title="Hit Die">
                                                    <span className="text-sm font-mono">d{viewingClassData.hd?.faces ?? 8}</span>
                                                </InfoTile>
                                                <InfoTile title="Subclass">
                                                    <span className="text-sm">{viewingSubclass ?? <span className="text-muted-foreground">—</span>}</span>
                                                </InfoTile>
                                                <InfoTile title="Spellcasting">
                                                    <span className="text-sm capitalize">
                                                        {viewingClassData.spellcastingAbility
                                                            ? (normalizeAbilityName(viewingClassData.spellcastingAbility) ?? viewingClassData.spellcastingAbility)
                                                            : <span className="text-muted-foreground">None</span>}
                                                    </span>
                                                </InfoTile>
                                            </div>

                                            {(viewingClassData.startingProficiencies?.armor?.length ?? 0) > 0 && (
                                                <InfoTile title="Armor Proficiencies">
                                                    <span
                                                        className="text-sm [&_a]:text-accent [&_a]:no-underline"
                                                        dangerouslySetInnerHTML={{ __html: viewingClassData.startingProficiencies!.armor!.map((v: string) => renderEntry(v).replace(/^<p>|<\/p>$/g, '')).join(', ') }}
                                                    />
                                                </InfoTile>
                                            )}
                                            {(viewingClassData.startingProficiencies?.weapons?.length ?? 0) > 0 && (
                                                <InfoTile title="Weapon Proficiencies">
                                                    <span
                                                        className="text-sm [&_a]:text-accent [&_a]:no-underline"
                                                        dangerouslySetInnerHTML={{ __html: viewingClassData.startingProficiencies!.weapons!.map((v: string) => renderEntry(v).replace(/^<p>|<\/p>$/g, '')).join(', ') }}
                                                    />
                                                </InfoTile>
                                            )}
                                            {(viewingClassData.startingProficiencies?.tools?.length ?? 0) > 0 && (
                                                <InfoTile title="Tool Proficiencies">
                                                    <span
                                                        className="text-sm [&_a]:text-accent [&_a]:no-underline"
                                                        dangerouslySetInnerHTML={{ __html: viewingClassData.startingProficiencies!.tools!.map((v: string) => renderEntry(v).replace(/^<p>|<\/p>$/g, '')).join(', ') }}
                                                    />
                                                </InfoTile>
                                            )}
                                            {(viewingClassData.proficiency?.length ?? 0) > 0 && (
                                                <InfoTile title="Saving Throws">
                                                    <span className="text-sm capitalize">{viewingClassData.proficiency!.map((a: string) => normalizeAbilityName(a) ?? a).join(', ')}</span>
                                                </InfoTile>
                                            )}

                                            {(viewingClassData.entries ?? []).length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">Description</h4>
                                                    <div className="space-y-2">
                                                        {(viewingClassData.entries as any[]).map((e: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold"
                                                                dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                ) : (
                                    <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-8 text-center">
                                        <div>
                                            <Sword className="h-8 w-8 mx-auto mb-2 opacity-30" weight="duotone" />
                                            <p>No class selected</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>
                    </Card>
                </div>
            </div>

            {/* ── Class picker dialog ──────────────────────────────────────────── */}
            <Dialog open={classPickerOpen} onOpenChange={(open) => { setClassPickerOpen(open); if (!open) setClassPickerSearch('') }}>
                <DialogContent className="sm:max-w-2xl flex flex-col gap-4 max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Choose a Class</DialogTitle>
                        <DialogDescription>Select your character's class</DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Search classes…"
                        value={classPickerSearch}
                        onChange={(e) => setClassPickerSearch(e.target.value)}
                        className="h-9"
                    />
                    <ScrollArea className="flex-1 max-h-[55vh]">
                        <div className="grid grid-cols-2 gap-2 pr-3">
                            {filteredClasses.map((cls) => (
                                <button
                                    key={`${cls.name}|${cls.source ?? ''}`}
                                    type="button"
                                    onClick={() => handleClassChange(cls.name, cls.source ?? undefined)}
                                    className={cn(
                                        'p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01]',
                                        (character.classSource
                                            ? (character.class === cls.name && character.classSource === (cls.source ?? ''))
                                            : character.class === cls.name)
                                            ? 'border-accent bg-accent/10'
                                            : 'border-border hover:border-accent/50',
                                    )}
                                >
                                    <div className="font-semibold font-display text-sm">{cls.name}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        d{cls.hd?.faces ?? 8}
                                        {cls.spellcastingAbility ? ' · Spellcaster' : ''}
                                    </div>
                                </button>
                            ))}
                            {filteredClasses.length === 0 && (
                                <p className="col-span-2 text-sm text-muted-foreground text-center py-4">No classes found</p>
                            )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* ── Spell picker dialog ──────────────────────────────────────────── */}
            {spellPickerLevel !== null && (() => {
                const gain = spellChoicesByLevel.get(spellPickerLevel)
                if (!gain) return null
                const ownedNames = new Set([...(character.cantrips ?? []), ...(character.spellsKnown ?? [])])
                const cats: CategoryLimit<Spell5e>[] = []
                if (gain.cantrips > 0) cats.push({ key: 'cantrips', label: 'cantrips', max: gain.cantrips, test: (s) => s.level === 0 })
                if (gain.spells > 0) cats.push({ key: 'spells', label: gain.maxSpellLevel > 0 ? `≤${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][gain.maxSpellLevel - 1]} spells` : 'spells', max: gain.spells, test: (s) => s.level > 0 && (gain.maxSpellLevel === 0 || s.level <= gain.maxSpellLevel) })
                const title = [gain.cantrips > 0 && `Learn ${gain.cantrips} cantrip${gain.cantrips > 1 ? 's' : ''}`, gain.spells > 0 && `${gain.spells} spell${gain.spells > 1 ? 's' : ''}${gain.maxSpellLevel > 0 ? ` (up to ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][gain.maxSpellLevel - 1]}-level)` : ''}`].filter(Boolean).join(' · ')
                // Pre-check the level filter checkboxes for available spell levels
                const levelValues: string[] = []
                if (gain.cantrips > 0) levelValues.push('0')
                if (gain.spells > 0 && gain.maxSpellLevel > 0) {
                    for (let i = 1; i <= gain.maxSpellLevel; i++) levelValues.push(String(i))
                }
                const allowedLevels = new Set(levelValues)
                const initialFilters: ActiveFilters = { level: new Set(levelValues), school: new Set(), type: new Set() }
                const levelKey = `${viewingClass}:${spellPickerLevel}`
                return (
                    <SpellSelectionModal
                        open={true}
                        onOpenChange={(o) => { if (!o) setSpellPickerLevel(null) }}
                        title={title}
                        spells={classSpells}
                        ownedNames={ownedNames}
                        categories={cats}
                        initialFilters={initialFilters}
                        allowedLevels={allowedLevels}
                        onConfirm={(names) => {
                            const newCantrips = names.filter((n) => (spells as Spell5e[]).find((s) => s.name === n)?.level === 0)
                            const newKnown = names.filter((n) => (spells as Spell5e[]).find((s) => s.name === n)?.level !== 0)
                            updateCharacter(character.id, {
                                cantrips: [...new Set([...(character.cantrips ?? []), ...newCantrips])],
                                spellsKnown: [...new Set([...(character.spellsKnown ?? []), ...newKnown])],
                                spellsByLevel: { ...(character.spellsByLevel ?? {}), [levelKey]: names },
                            })
                            setSpellPickerLevel(null)
                        }}
                    />
                )
            })()}

            {/* ── Subclass picker dialog ───────────────────────────────────────── */}
            {subclassPickerOpen && (
                <SubclassSelectionModal
                    open={subclassPickerOpen}
                    onOpenChange={setSubclassPickerOpen}
                    title={`Choose ${(viewingClassData as any)?.subclassTitle ?? 'Subclass'}`}
                    subclasses={subclasses}
                    selectedName={viewingSubclass ?? undefined}
                    onConfirm={(sc) => { handleSubclassSelect(sc) }}
                />
            )}

            {/* ── Optional feature picker ──────────────────────────────────── */}
            {optPickerState && (() => {
                const featuresOfType = (optFeatures as any[]).filter((f: any) => {
                    const fTypes: string[] = Array.isArray(f.featureType)
                        ? f.featureType
                        : [f.featureType ?? '']
                    return optPickerState.featureTypes.some((t) => fTypes.includes(t))
                })
                const initialSelectedNames = character.features
                    .filter((f) => featuresOfType.some((of: any) => of.name === f.name))
                    .map((f) => f.name)
                return (
                    <OptionalFeatureSelectionModal
                        open={true}
                        onOpenChange={(o) => { if (!o) setOptPickerState(null) }}
                        title={`Choose ${optPickerState.progName}`}
                        features={featuresOfType}
                        maxSelections={optPickerState.total}
                        initialSelectedNames={initialSelectedNames}
                        characterSnapshot={characterSnapshot}
                        className={viewingClass}
                        onConfirm={(names) => {
                            handleOptFeatureConfirm(names, optPickerState.featureTypes)
                            setOptPickerState(null)
                        }}
                    />
                )
            })()}
        </div>
    )
}
