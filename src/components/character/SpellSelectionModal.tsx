// Spell-specific wrapper around SelectionModal<Spell5e>.
// Handles filter sections (level, school, ritual), card rendering,
// and converting selected Spell5e items back to spell names for the caller.

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import {
    SelectionModal,
    type ActiveFilters,
    type FilterSection,
    type CategoryLimit,
} from '@/components/ui/SelectionModal'
import {
    SPELL_SCHOOL_NAMES,
    getSchoolName,
    formatCastingTime,
    formatRange,
    formatDuration,
    formatComponents,
    formatSpellLevel,
} from '@/lib/spellUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

// ─── renderEntry cache ────────────────────────────────────────────────────────
// 5etools entry objects are stable references from the game data store, so
// we can cache their HTML output to avoid re-running renderEntry on every
// modal open / remount.
const _entryCache = new WeakMap<object, string>()
function cachedEntry(entry: unknown): string {
    if (!entry) return ''
    if (typeof entry !== 'object') return renderEntry(entry)
    const hit = _entryCache.get(entry as object)
    if (hit !== undefined) return hit
    const html = renderEntry(entry)
    _entryCache.set(entry as object, html)
    return html
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpellLevelLimit {
    /** 0 = cantrip; 1–9 = spell level */
    level: number
    max: number
}

export interface SpellSelectionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    spells: Spell5e[]
    /** Names already learned — hidden from the list so the user can't re-add them. */
    ownedNames?: Set<string>
    /** Per-level selection limits expressed as CategoryLimit objects. Optional. */
    categories?: CategoryLimit<Spell5e>[]
    /** Pre-selected spell names when the dialog opens. */
    initialSelectedNames?: string[]
    /** Active filter state to pre-apply when the dialog opens (e.g. level checkboxes). */
    initialFilters?: ActiveFilters
    /** When set, level filter options NOT in this set are disabled (greyed out). */
    allowedLevels?: Set<string>
    /** Optional class filter — show only spells on that class list (lowercase). */
    classFilter?: string
    onConfirm: (names: string[]) => void
}

// ─── Filter sections ──────────────────────────────────────────────────────────

const ALL_LEVEL_OPTIONS = [
    { value: '0', label: 'Cantrip' },
    ...Array.from({ length: 9 }, (_, i) => ({
        value: String(i + 1),
        label: `Level ${i + 1}`,
    })),
]

function buildLevelFilter(allowedLevels: Set<string> | undefined): FilterSection {
    const disabledValues = allowedLevels
        ? new Set(ALL_LEVEL_OPTIONS.map((o) => o.value).filter((v) => !allowedLevels.has(v)))
        : undefined
    return {
        key: 'level',
        label: 'Level',
        type: 'checkboxes',
        columns: 2,
        options: ALL_LEVEL_OPTIONS,
        ...(disabledValues ? { disabledValues } : {}),
    }
}

const SCHOOL_FILTER: FilterSection = {
    key: 'school',
    label: 'School',
    type: 'checkboxes',
    columns: 2,
    options: Object.entries(SPELL_SCHOOL_NAMES).map(([abbr, name]) => ({
        value: abbr,
        label: name,
    })),
}

const TYPE_FILTER: FilterSection = {
    key: 'type',
    label: 'Type',
    type: 'switches',
    columns: 1,
    options: [
        { value: 'ritual', label: 'Ritual only' },
        { value: 'concentration', label: 'Concentration only' },
        { value: 'no-verbal', label: 'No verbal component' },
        { value: 'no-somatic', label: 'No somatic component' },
        { value: 'no-material', label: 'No material component' },
    ],
}

// ─── Match function ───────────────────────────────────────────────────────────

function matchSpell(
    spell: Spell5e,
    search: string,
    activeFilters: ActiveFilters,
    ownedNames: Set<string>,
    classFilter: string,
    strictLevels: boolean,
): boolean {
    // Hide already-owned spells.
    if (ownedNames.has(spell.name)) return false

    // Class filter: if provided, ensure the spell is on that class list.
    if (classFilter) {
        const fromList = spell.classes?.fromClassList ?? []
        if (
            fromList.length > 0 &&
            !fromList.some((c: any) => c.name?.toLowerCase() === classFilter)
        )
            return false
    }

    // Name search.
    if (search && !spell.name.toLowerCase().includes(search.toLowerCase())) return false

    // Level filter.
    // strictLevels=true (class card): empty set means nothing is selected → no results.
    // strictLevels=false (browse page): empty set means no filter → all pass.
    const levelSet = activeFilters.level
    if (strictLevels) {
        if (!levelSet || levelSet.size === 0 || !levelSet.has(String(spell.level))) return false
    } else {
        if (levelSet && levelSet.size > 0 && !levelSet.has(String(spell.level))) return false
    }

    // School filter.
    const schoolSet = activeFilters.school
    if (schoolSet && schoolSet.size > 0 && !schoolSet.has(spell.school)) return false

    // Ritual switch.
    const typeSet = activeFilters.type
    if (typeSet?.has('ritual') && !spell.meta?.ritual) return false
    if (typeSet?.has('concentration') && !spell.duration.some((d) => d.concentration)) return false
    if (typeSet?.has('no-verbal') && spell.components?.v) return false
    if (typeSet?.has('no-somatic') && spell.components?.s) return false
    if (typeSet?.has('no-material') && !!spell.components?.m) return false

    return true
}

// ─── Spell card ───────────────────────────────────────────────────────────────

interface SpellCardProps {
    spell: Spell5e
    isSelected: boolean
}

const SpellCard = memo(function SpellCard({ spell, isSelected }: SpellCardProps) {
    const isRitual = !!spell.meta?.ritual
    const isConcentration = spell.duration.some((d) => d.concentration)
    const firstEntry = spell.entries?.[0]
    const descHtml = cachedEntry(firstEntry)

    return (
        <div className="p-3.5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                    <span className="font-semibold text-base leading-tight">{spell.name}</span>
                    <span className="text-[13px] text-muted-foreground ml-2 leading-tight">
                        {formatSpellLevel(spell.level)} · {getSchoolName(spell.school)}
                    </span>
                </div>
                <div className="flex gap-1 flex-wrap flex-shrink-0">
                    {isRitual && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-blue-500/60 text-blue-500">
                            R
                        </Badge>
                    )}
                    {isConcentration && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-yellow-500/60 text-yellow-500">
                            C
                        </Badge>
                    )}
                    {isSelected && (
                        <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">
                            ✓
                        </Badge>
                    )}
                </div>
            </div>

            {/* Stats grid */}
            <div className={cn('grid grid-cols-4 gap-px text-xs mb-2 rounded-md overflow-hidden bg-border')}>
                {(
                    [
                        ['Cast', formatCastingTime(spell.time)],
                        ['Range', formatRange(spell.range)],
                        ['Duration', formatDuration(spell.duration)],
                        ['Components', formatComponents(spell.components)],
                    ] as [string, string][]
                ).map(([label, value]) => (
                    <div key={label} className="text-center bg-muted/60 px-1 py-1.5">
                        <div className="text-muted-foreground font-medium leading-none mb-0.5">
                            {label}
                        </div>
                        <div className="text-foreground leading-snug truncate" title={value}>
                            {value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Description preview */}
            {descHtml && (
                <div
                    className="text-[13px] text-muted-foreground line-clamp-3 leading-snug"
                    // renderEntry returns safe HTML produced from structured 5etools data.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: descHtml }}
                />
            )}
        </div>
    )
})

// ─── Public component ─────────────────────────────────────────────────────────

export function SpellSelectionModal({
    open,
    onOpenChange,
    title = 'Add Spells',
    spells,
    ownedNames = new Set(),
    categories,
    initialSelectedNames = [],
    initialFilters,
    allowedLevels,
    classFilter = '',
    onConfirm,
}: SpellSelectionModalProps) {
    const getItemId = (spell: Spell5e) => `${spell.name}|${spell.source ?? ''}`

    const initialSelectedIds = initialSelectedNames.map((name) => {
        const found = spells.find((s) => s.name === name)
        return found ? getItemId(found) : name
    })

    const filterSections = [buildLevelFilter(allowedLevels), SCHOOL_FILTER, TYPE_FILTER]

    return (
        <SelectionModal<Spell5e>
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            items={spells}
            getItemId={getItemId}
            renderCard={(spell, isSelected) => (
                <SpellCard spell={spell} isSelected={isSelected} />
            )}
            matchItem={(spell, search, activeFilters) =>
                matchSpell(spell, search, activeFilters, ownedNames, classFilter, !!allowedLevels)
            }
            filterSections={filterSections}
            categories={categories}
            initialSelectedIds={initialSelectedIds}
            initialFilters={initialFilters}
            onConfirm={(_ids, selectedItems) =>
                onConfirm(selectedItems.map((s) => s.name))
            }
        />
    )
}
