import { useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Brain,
    Certificate,
    CaretLeft,
    CaretRight,
    Check,
    GlobeHemisphereWest,
    Shield,
    ShieldCheck,
    Sword,
    Wrench,
} from '@phosphor-icons/react'
import { renderEntry } from '@/lib/renderer'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { useSkills } from '@/hooks/character/useSkills'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useAvailableProficiencies } from '@/hooks/data/useAvailableProficiencies'
import { cn } from '@/lib/utils'
import { NoCharCard, InfoTile } from '@/pages/_shared'
import { SKILL_TO_ABILITY } from '@/lib/calculations/skills'
import { normalizeKey } from '@/lib/provenance'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'

type ProfFocus =
    | { type: 'skill'; name: string; ability: string; proficient: boolean; expertise: boolean; modifierString: string }
    | { type: 'save'; ability: string; proficient: boolean; modifierString: string }
    | { type: 'item'; category: string; name: string }

/** Case-insensitive check for a proficiency name in an array. */
function hasProfInArray(arr: unknown[], name: unknown): boolean {
    if (typeof name !== 'string') return false
    const norm = normalizeKey(name)
    return arr.some((p) => typeof p === 'string' && normalizeKey(p) === norm)
}

function formatProfLabel(value: string): string {
    return value
        .toLowerCase()
        .replace(/(^|[\s/-])([a-z])/g, (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`)
}

const SAVE_ABBREVIATIONS: Record<string, string> = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
}

type ToolGenericKind = 'musical instrument' | "artisan's tools" | 'gaming set'

type ToolChoiceSlot = {
    id: string
    choiceId: string
    label: string
    sourceName: string
    options: string[]
}

function normalizeGenericToolKind(value: string): ToolGenericKind | null {
    const key = normalizeKey(value)
    if (key.includes('musical instrument') || key === 'anymusicalinstrument' || key === 'instrumentmusical') {
        return 'musical instrument'
    }
    if (
        key.includes("artisan's tool") ||
        key.includes('artisans tool') ||
        key === 'anyartisanstool' ||
        key === 'anyartisantool'
    ) {
        return "artisan's tools"
    }
    if (key.includes('gaming set') || key === 'anygamingset' || key === 'setgaming') {
        return 'gaming set'
    }
    return null
}

function getItemTypePrefix(type: unknown): string {
    if (typeof type !== 'string') return ''
    return type.split('|')[0] ?? ''
}

function addUniqueByNorm(list: string[], value: unknown): string[] {
    if (typeof value !== 'string' || !value.trim()) return list
    const exists = list.some((v) => normalizeKey(v) === normalizeKey(value))
    if (exists) return list
    return [...list, value]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function BuildProficienciesPage() {
    const character = useCharacterStore((s) => s.activeCharacter)
    const gameData = useGameDataStore((s) => s.gameData)
    const { skills } = useSkills()
    const { savingThrows } = useSavingThrows()
    const { ledger, resolveChoiceSelection, getSourcesRowsBySection } = useProvenance()
    const availableProficiencies = useAvailableProficiencies()

    const [detailCollapsed, setDetailCollapsed] = useState(false)
    const [focused, setFocused] = useState<ProfFocus | null>(null)

    // Look up rich skill description from game data if available
    const skillDescriptions = useMemo(() => {
        const map: Record<string, any[]> = {}
        if (gameData?.skills) {
            for (const [, skill] of Object.entries(gameData.skills as Record<string, any>)) {
                if (skill?.name && skill?.entries) {
                    map[skill.name.toLowerCase()] = skill.entries
                }
            }
        }
        return map
    }, [gameData?.skills])

    const choiceCounts = useMemo(() => {
        const counts: Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number> = {
            skills: 0,
            armor: 0,
            weapons: 0,
            tools: 0,
            languages: 0,
        }
        for (const choice of ledger.choices) {
            if (!(choice.domain in counts)) continue
            const key = choice.domain as keyof typeof counts
            counts[key] += Math.max(0, choice.chooseCount - choice.selected.length)
        }
        return counts
    }, [ledger.choices])

    const choiceSelectedClass = 'border-2 border-accent border-dashed bg-accent/10 text-accent-foreground hover:bg-accent/15'
    const fixedSelectedClass = 'border-accent bg-accent/20 text-accent-foreground hover:bg-accent/30'

    const toolSubtypeOptionsByKind = useMemo(() => {
        const fromBase = gameData?.itemsBase ?? []
        const fromItems = gameData?.items ?? []
        const allowedSources = character?.allowedSources ?? []
        const hasSourceFilter = allowedSources.length > 0

        const filterBySource = (items: any[]) =>
            items.filter((item) => {
                if (!hasSourceFilter) return true
                if (!item?.source) return true
                return allowedSources.includes(item.source)
            })

        const collectByType = (items: any[], typePrefix: string): string[] => {
            const filtered = items.filter((item) => getItemTypePrefix(item?.type) === typePrefix)
            let out: string[] = []
            for (const item of filtered) {
                out = addUniqueByNorm(out, item?.name)
            }
            return out.sort((a, b) => a.localeCompare(b))
        }

        const baseItems = filterBySource(fromBase)
        const allItems = filterBySource([...fromBase, ...fromItems])

        const instruments = collectByType(baseItems, 'INS')
        const artisans = collectByType(baseItems, 'AT')
        const gaming = collectByType(baseItems, 'GS')

        return {
            'musical instrument': instruments.length > 0 ? instruments : collectByType(allItems, 'INS'),
            "artisan's tools": artisans.length > 0 ? artisans : collectByType(allItems, 'AT'),
            'gaming set': gaming.length > 0 ? gaming : collectByType(allItems, 'GS'),
        } as Record<ToolGenericKind, string[]>
    }, [character?.allowedSources, gameData?.items, gameData?.itemsBase])

    const genericToolKinds = useMemo(
        () => new Set<ToolGenericKind>(['musical instrument', "artisan's tools", 'gaming set']),
        [],
    )

    const visibleToolPills = useMemo(
        () => availableProficiencies.tools.filter((toolName) => {
            if (typeof toolName !== 'string') return false
            const kind = normalizeGenericToolKind(toolName)
            return !kind || !genericToolKinds.has(kind)
        }),
        [availableProficiencies.tools, genericToolKinds],
    )

    const toolChoiceSlots = useMemo(() => {
        const selectedToolNorms = new Set((character?.proficiencies.tools ?? []).map((name) => normalizeKey(name)))
        const slots: ToolChoiceSlot[] = []

        for (const choice of ledger.choices) {
            if (choice.domain !== 'tools') continue
            const kinds = Array.from(
                new Set(
                    choice.optionPool
                        .map((token) => normalizeGenericToolKind(token))
                        .filter((kind): kind is ToolGenericKind => Boolean(kind)),
                ),
            )
            if (kinds.length === 0) continue

            const remaining = Math.max(0, choice.chooseCount - choice.selected.length)
            if (remaining === 0) continue

            const pool = Array.from(
                new Set(
                    kinds.flatMap((kind) => toolSubtypeOptionsByKind[kind] ?? []),
                ),
            )
                .filter((name) => !selectedToolNorms.has(normalizeKey(name)))
                .sort((a, b) => a.localeCompare(b))

            const label = kinds.length === 1 ? kinds[0] : 'tool proficiency'

            for (let idx = 0; idx < remaining; idx++) {
                slots.push({
                    id: `${choice.id}:${idx}`,
                    choiceId: choice.id,
                    label,
                    sourceName: choice.sourceTag.sourceName,
                    options: pool,
                })
            }
        }

        return slots
    }, [character?.proficiencies.tools, ledger.choices, toolSubtypeOptionsByKind])

    if (!character) {
        return (
            <NoCharCard icon={<Certificate weight="duotone" />} noun="view proficiencies" />
        )
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-6 pt-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <h1 className="font-display text-2xl font-bold flex items-center gap-3">
                        <Certificate className="h-6 w-6 text-accent" weight="duotone" />
                        Proficiencies
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

                            {/* Left pane — tabs */}
                            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4 pr-8">
                                        <Tabs defaultValue="skills">
                                            <TabsList className="mb-4 flex-wrap h-auto gap-1">
                                                <TabsTrigger value="skills" className="inline-flex items-center gap-1.5">
                                                    Skills
                                                    {choiceCounts.skills > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">{choiceCounts.skills}</Badge>}
                                                </TabsTrigger>
                                                <TabsTrigger value="saving-throws">Saves</TabsTrigger>
                                                <TabsTrigger value="armor" className="inline-flex items-center gap-1.5">
                                                    Armor
                                                    {choiceCounts.armor > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">{choiceCounts.armor}</Badge>}
                                                </TabsTrigger>
                                                <TabsTrigger value="weapons" className="inline-flex items-center gap-1.5">
                                                    Weapons
                                                    {choiceCounts.weapons > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">{choiceCounts.weapons}</Badge>}
                                                </TabsTrigger>
                                                <TabsTrigger value="tools" className="inline-flex items-center gap-1.5">
                                                    Tools
                                                    {choiceCounts.tools > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">{choiceCounts.tools}</Badge>}
                                                </TabsTrigger>
                                                <TabsTrigger value="languages" className="inline-flex items-center gap-1.5">
                                                    Languages
                                                    {choiceCounts.languages > 0 && <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] leading-none">{choiceCounts.languages}</Badge>}
                                                </TabsTrigger>
                                            </TabsList>

                                            <TabsContent value="skills">
                                                <div className="flex flex-wrap gap-2">
                                                    {skills.map((skill) => {
                                                        const normName = skill.name
                                                        const hasLedgerGrant = (ledger.proficiencies.skills[normName] ?? []).length > 0
                                                        const isSelected = skill.proficient || hasLedgerGrant
                                                        const isFixed = (ledger.proficiencies.skills[normName] ?? []).some((t) => t.grantType === 'fixed')
                                                        const isChoiceSelected = ledger.choices.some(
                                                            (c) => c.domain === 'skills' && c.selected.some((s) => normalizeKey(s) === normName),
                                                        )
                                                        const canSelect = !isSelected && ledger.choices.some(
                                                            (c) =>
                                                                c.domain === 'skills' &&
                                                                c.selected.length < c.chooseCount &&
                                                                (c.optionPool.length === 0 || c.optionPool.some((p) => normalizeKey(p) === normName)),
                                                        )
                                                        const canDeselect = isChoiceSelected && !isFixed
                                                        const isFocused = focused?.type === 'skill' && focused.name === skill.name
                                                        return (
                                                            <button
                                                                key={skill.name}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (canDeselect) resolveChoiceSelection('skills', skill.name, false)
                                                                    else if (canSelect) resolveChoiceSelection('skills', skill.name, true)
                                                                    setFocused({
                                                                        type: 'skill',
                                                                        name: skill.name,
                                                                        ability: SKILL_TO_ABILITY[skill.name.toLowerCase()] ?? '',
                                                                        proficient: isSelected,
                                                                        expertise: skill.expertise,
                                                                        modifierString: skill.modifierString,
                                                                    })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                                                                    isChoiceSelected
                                                                        ? choiceSelectedClass
                                                                        : isSelected
                                                                            ? fixedSelectedClass
                                                                            : canSelect
                                                                                ? 'border-border bg-card text-foreground hover:border-accent'
                                                                                : 'border-border bg-card text-muted-foreground opacity-50',
                                                                    isFocused && 'ring-2 ring-accent/70 ring-offset-2',
                                                                )}
                                                            >
                                                                {isSelected ? <Check className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
                                                                <span>{formatProfLabel(skill.name)}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="saving-throws">
                                                <div className="flex flex-wrap gap-2">
                                                    {savingThrows.map((st) => {
                                                        const normAbility = normalizeKey(st.ability)
                                                        const abbr = SAVE_ABBREVIATIONS[normAbility]
                                                        const hasLedgerGrant =
                                                            (ledger.proficiencies.savingThrows[normAbility] ?? []).length > 0 ||
                                                            (abbr ? (ledger.proficiencies.savingThrows[abbr] ?? []).length > 0 : false)
                                                        const isSelected = st.proficient || hasLedgerGrant
                                                        const isFocused = focused?.type === 'save' && focused.ability === st.ability
                                                        return (
                                                            <button
                                                                key={st.ability}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({
                                                                        type: 'save',
                                                                        ability: st.ability,
                                                                        proficient: isSelected,
                                                                        modifierString: st.modifierString,
                                                                    })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium inline-flex items-center gap-2 text-left',
                                                                    isSelected
                                                                        ? 'border-accent bg-accent/20 text-accent-foreground hover:bg-accent/30'
                                                                        : 'border-border bg-card text-muted-foreground opacity-50',
                                                                    isFocused && 'ring-2 ring-accent ring-offset-2',
                                                                )}
                                                            >
                                                                {isSelected ? <Check className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                                                <span>{formatProfLabel(st.ability)}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="armor">
                                                <div className="flex flex-wrap gap-2">
                                                    {availableProficiencies.armor.filter((armorKey): armorKey is string => typeof armorKey === 'string').map((armorKey) => {
                                                        const isSelected = hasProfInArray(character.proficiencies.armor, armorKey)
                                                        return (
                                                            <button
                                                                key={armorKey}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Armor', name: armorKey })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium flex items-center gap-2 cursor-default',
                                                                    isSelected
                                                                        ? 'border-accent bg-accent/20 text-accent-foreground'
                                                                        : 'border-border bg-card text-muted-foreground opacity-50',
                                                                    focused?.type === 'item' && focused.name === armorKey && 'ring-2 ring-accent ring-offset-2',
                                                                )}
                                                            >
                                                                {isSelected ? <Check className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                                                                <span>{formatProfLabel(armorKey)}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="weapons">
                                                <div className="flex flex-wrap gap-2">
                                                    {availableProficiencies.weapons.filter((weaponKey): weaponKey is string => typeof weaponKey === 'string').map((weaponKey) => {
                                                        const isSelected = hasProfInArray(character.proficiencies.weapons, weaponKey)
                                                        return (
                                                            <button
                                                                key={weaponKey}
                                                                type="button"
                                                                onClick={() => {
                                                                    setFocused({ type: 'item', category: 'Weapon', name: weaponKey })
                                                                    if (detailCollapsed) setDetailCollapsed(false)
                                                                }}
                                                                className={cn(
                                                                    'px-3 py-2 rounded-lg border text-sm transition-all font-medium flex items-center gap-2 cursor-default',
                                                                    isSelected
                                                                        ? 'border-accent bg-accent/20 text-accent-foreground'
                                                                        : 'border-border bg-card text-muted-foreground opacity-50',
                                                                    focused?.type === 'item' && focused.name === weaponKey && 'ring-2 ring-accent ring-offset-2',
                                                                )}
                                                            >
                                                                {isSelected ? <Check className="h-3.5 w-3.5" /> : <Sword className="h-3.5 w-3.5" />}
                                                                <span>{formatProfLabel(weaponKey)}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="tools">
                                                <div className="flex flex-wrap gap-2">
                                                    {toolChoiceSlots.length > 0 && (
                                                        <div className="w-full space-y-2 mb-1">
                                                            {toolChoiceSlots.map((slot) => (
                                                                <div key={slot.id} className="w-full max-w-lg rounded-lg border border-border bg-card p-2.5">
                                                                    <p className="text-xs text-muted-foreground mb-2">
                                                                        {slot.sourceName}: choose {formatProfLabel(slot.label)}
                                                                    </p>
                                                                    <Select
                                                                        onValueChange={(value) => {
                                                                            resolveChoiceSelection('tools', value, true, slot.choiceId)
                                                                            setFocused({ type: 'item', category: 'Tool', name: value })
                                                                            if (detailCollapsed) setDetailCollapsed(false)
                                                                        }}
                                                                        disabled={slot.options.length === 0}
                                                                    >
                                                                        <SelectTrigger className="h-9 border-dashed">
                                                                            <SelectValue placeholder={`${formatProfLabel(slot.label)} (choose type)`} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {slot.options.map((option) => (
                                                                                <SelectItem key={option} value={option}>
                                                                                    {formatProfLabel(option)}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {availableProficiencies.tools.length > 0 ? (
                                                        visibleToolPills.filter((toolName): toolName is string => typeof toolName === 'string').map((toolName) => {
                                                            const normTool = normalizeKey(toolName)
                                                            const isSelected = hasProfInArray(character.proficiencies.tools, toolName)
                                                            const isFixed = (ledger.proficiencies.tools[normTool] ?? []).some((t) => t.grantType === 'fixed')
                                                            const isChoiceSelected = ledger.choices.some(
                                                                (c) => c.domain === 'tools' && c.selected.some((s) => normalizeKey(s) === normTool),
                                                            )
                                                            const canSelect = !isSelected && ledger.choices.some(
                                                                (c) =>
                                                                    c.domain === 'tools' &&
                                                                    c.selected.length < c.chooseCount &&
                                                                    (c.optionPool.length === 0 || c.optionPool.some((p) => normalizeKey(p) === normTool)),
                                                            )
                                                            const canDeselect = isChoiceSelected && !isFixed
                                                            return (
                                                                <button
                                                                    key={toolName}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (canDeselect) resolveChoiceSelection('tools', toolName, false)
                                                                        else if (canSelect) resolveChoiceSelection('tools', toolName, true)
                                                                        setFocused({ type: 'item', category: 'Tool', name: toolName })
                                                                        if (detailCollapsed) setDetailCollapsed(false)
                                                                    }}
                                                                    className={cn(
                                                                        'px-3 py-2 rounded-lg border text-sm transition-all font-medium flex items-center gap-2',
                                                                        isChoiceSelected
                                                                            ? choiceSelectedClass
                                                                            : isSelected
                                                                                ? fixedSelectedClass
                                                                                : canSelect
                                                                                    ? 'border-border bg-card text-foreground hover:border-accent cursor-pointer'
                                                                                    : 'border-border bg-card text-muted-foreground opacity-50',
                                                                        focused?.type === 'item' && focused.name === toolName && 'ring-2 ring-accent/70 ring-offset-2',
                                                                    )}
                                                                >
                                                                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                                                                    {formatProfLabel(toolName)}
                                                                </button>
                                                            )
                                                        })
                                                    ) : (
                                                        <p className="text-muted-foreground text-sm">No tools available in game data</p>
                                                    )}
                                                </div>
                                            </TabsContent>

                                            <TabsContent value="languages">
                                                <div className="flex flex-wrap gap-2">
                                                    {availableProficiencies.languages.length > 0 ? (
                                                        availableProficiencies.languages.filter((langName): langName is string => typeof langName === 'string').map((langName) => {
                                                            const normLang = normalizeKey(langName)
                                                            const hasLedgerGrant = (ledger.proficiencies.languages[normLang] ?? []).length > 0
                                                            const isSelected = hasProfInArray(character.proficiencies.languages, langName) || hasLedgerGrant
                                                            const isFixed = (ledger.proficiencies.languages[normLang] ?? []).some((t) => t.grantType === 'fixed')
                                                            const isChoiceSelected = ledger.choices.some(
                                                                (c) => c.domain === 'languages' && c.selected.some((s) => normalizeKey(s) === normLang),
                                                            )
                                                            const canSelect = !isSelected && ledger.choices.some(
                                                                (c) =>
                                                                    c.domain === 'languages' &&
                                                                    c.selected.length < c.chooseCount &&
                                                                    (
                                                                        (c.optionPool.length > 0 && c.optionPool.some((p) => normalizeKey(p) === normLang)) ||
                                                                        (c.optionPool.length === 0 && availableProficiencies.isStandardLanguage(langName))
                                                                    ),
                                                            )
                                                            const canDeselect = isChoiceSelected && !isFixed
                                                            return (
                                                                <button
                                                                    key={langName}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (canDeselect) resolveChoiceSelection('languages', langName, false)
                                                                        else if (canSelect) resolveChoiceSelection('languages', langName, true)
                                                                        setFocused({ type: 'item', category: 'Language', name: langName })
                                                                        if (detailCollapsed) setDetailCollapsed(false)
                                                                    }}
                                                                    className={cn(
                                                                        'px-3 py-2 rounded-lg border text-sm transition-all font-medium flex items-center gap-2',
                                                                        isChoiceSelected
                                                                            ? choiceSelectedClass
                                                                            : isSelected
                                                                                ? fixedSelectedClass
                                                                                : canSelect
                                                                                    ? 'border-border bg-card text-foreground hover:border-accent cursor-pointer'
                                                                                    : 'border-border bg-card text-muted-foreground opacity-50',
                                                                        focused?.type === 'item' && focused.name === langName && 'ring-2 ring-accent/70 ring-offset-2',
                                                                    )}
                                                                >
                                                                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <GlobeHemisphereWest className="h-3.5 w-3.5" />}
                                                                    {formatProfLabel(langName)}
                                                                </button>
                                                            )
                                                        })
                                                    ) : (
                                                        <p className="text-muted-foreground text-sm">No languages available in game data</p>
                                                    )}
                                                </div>
                                            </TabsContent>
                                        </Tabs>
                                    </div>
                                </ScrollArea>
                                <div className="px-4 pb-4 border-t border-border">
                                    <SourcesAccordion
                                        sectionId="build-proficiencies"
                                        rows={getSourcesRowsBySection('build-proficiencies')}
                                    />
                                </div>
                            </div>

                            {/* Right pane — proficiency detail */}
                            <div
                                className={cn(
                                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                                    detailCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none' : 'w-[40%] min-w-[280px]',
                                )}
                            >
                                <div className="p-4 border-b border-border">
                                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                        Details
                                    </span>
                                </div>
                                <ScrollArea className="flex-1 overflow-hidden">
                                    <div className="p-4">
                                        {!focused ? (
                                            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm text-center">
                                                Click any proficiency to view details
                                            </div>
                                        ) : focused.type === 'skill' ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                                                    <p className="text-sm text-muted-foreground capitalize">{focused.ability} check</p>
                                                </div>
                                                <Separator />
                                                <div className="grid grid-cols-3 gap-3">
                                                    <InfoTile title="Modifier">
                                                        <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                                                    </InfoTile>
                                                    <InfoTile title="Proficient">
                                                        <span className={cn('text-sm font-medium', focused.proficient ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.proficient ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                    <InfoTile title="Expertise">
                                                        <span className={cn('text-sm font-medium', focused.expertise ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.expertise ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                </div>
                                                {skillDescriptions[focused.name.toLowerCase()]?.length > 0 && (
                                                    <div>
                                                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Description</h4>
                                                        {skillDescriptions[focused.name.toLowerCase()].map((e: any, i: number) => (
                                                            <div
                                                                key={i}
                                                                className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1"
                                                                dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : focused.type === 'save' ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.ability} Save</h2>
                                                    <p className="text-sm text-muted-foreground">Saving Throw</p>
                                                </div>
                                                <Separator />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <InfoTile title="Modifier">
                                                        <span className="text-xl font-bold font-mono">{focused.modifierString}</span>
                                                    </InfoTile>
                                                    <InfoTile title="Proficient">
                                                        <span className={cn('text-sm font-medium', focused.proficient ? 'text-accent' : 'text-muted-foreground')}>
                                                            {focused.proficient ? 'Yes' : 'No'}
                                                        </span>
                                                    </InfoTile>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div>
                                                    <h2 className="text-xl font-display font-bold capitalize">{focused.name}</h2>
                                                    <p className="text-sm text-muted-foreground">{focused.category} Proficiency</p>
                                                </div>
                                                <Separator />
                                                <div className="space-y-2">
                                                    <Badge variant="secondary" className="capitalize">{focused.category}</Badge>
                                                    {!hasProfInArray(
                                                        character.proficiencies[focused.category.toLowerCase() as 'armor' | 'weapons' | 'tools' | 'languages'] ?? [],
                                                        focused.name,
                                                    ) && (
                                                            <p className="text-xs text-muted-foreground italic">
                                                                Not currently selected.
                                                            </p>
                                                        )}
                                                </div>
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
