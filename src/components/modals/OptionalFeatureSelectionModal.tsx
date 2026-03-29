// Optional-feature wrapper around SelectionModal<any>.
// Handles Eldritch Invocations, Fighting Styles, Metamagic, Monk options, etc.
// All prerequisite evaluation happens here; the caller only provides raw
// feature objects pre-filtered to the correct featureType(s).

import { memo, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Warning } from '@phosphor-icons/react'
import {
    SelectionModal,
    type CategoryLimit,
    type ActiveFilters,
} from '@/components/modals/SelectionModal'
import { renderEntry } from '@/lib/renderer'
import {
    checkAllPrerequisites,
    type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { cn } from '@/lib/utils'

// ─── renderEntry cache ────────────────────────────────────────────────────────

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

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OptionalFeatureSelectionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Dialog title, e.g. "Choose Eldritch Invocations" */
    title: string
    /** Pre-filtered list of optional feature objects for this featureType. */
    features: any[]
    /** Maximum allowed selections (total at current class level). */
    maxSelections: number
    /** Feature names already chosen when the dialog opens. */
    initialSelectedNames?: string[]
    /** Character snapshot used for prerequisite validation. */
    characterSnapshot: PrereqCharacterSnapshot
    /** Class name for level-based prereq checks (e.g. "Warlock"). */
    className?: string
    onConfirm: (names: string[]) => void
}

// ─── Feature card ─────────────────────────────────────────────────────────────

interface FeatureCardProps {
    feature: any
    isSelected: boolean
    prereqMet: boolean
    prereqReasons: string[]
}

const FeatureCard = memo(function FeatureCard({
    feature,
    isSelected,
    prereqMet,
    prereqReasons,
}: FeatureCardProps) {
    const firstEntry = feature.entries?.[0]
    const descHtml = firstEntry ? cachedEntry(firstEntry) : ''

    return (
        <div className="p-3.5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <span
                    className={cn(
                        'font-semibold text-base leading-tight',
                        !prereqMet && !isSelected && 'text-muted-foreground',
                    )}
                >
                    {feature.name}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                    {feature.source && (
                        <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 h-5 text-muted-foreground"
                        >
                            {feature.source}
                        </Badge>
                    )}
                    {isSelected && (
                        <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">
                            ✓
                        </Badge>
                    )}
                </div>
            </div>

            {/* Prerequisite failure warning */}
            {!prereqMet && prereqReasons.length > 0 && (
                <div className="flex items-start gap-1.5 mb-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <Warning
                        className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5"
                        weight="fill"
                    />
                    <div className="text-xs text-amber-500/90 leading-snug">
                        {prereqReasons.join(' · ')}
                    </div>
                </div>
            )}

            {/* Description excerpt */}
            {descHtml && (
                <div
                    className={cn(
                        'text-[13px] text-muted-foreground line-clamp-3 leading-snug',
                        !prereqMet && !isSelected && 'opacity-70',
                    )}
                    // renderEntry returns safe HTML from structured 5etools data.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: descHtml }}
                />
            )}
        </div>
    )
})

// ─── Public component ─────────────────────────────────────────────────────────

export function OptionalFeatureSelectionModal({
    open,
    onOpenChange,
    title,
    features,
    maxSelections,
    initialSelectedNames = [],
    characterSnapshot,
    className,
    onConfirm,
}: OptionalFeatureSelectionModalProps) {
    // Deduplicate by name (same feature may appear across multiple sources).
    const dedupedFeatures = useMemo(() => {
        const seen = new Map<string, any>()
        for (const f of features) {
            if (!seen.has(f.name)) seen.set(f.name, f)
        }
        return Array.from(seen.values())
    }, [features])

    // Run all prerequisite checks up-front so each card doesn't recompute.
    const prereqMap = useMemo(() => {
        const map = new Map<string, { met: boolean; reasons: string[] }>()
        for (const f of dedupedFeatures) {
            const result = checkAllPrerequisites(f, characterSnapshot, { className })
            map.set(f.name, { met: result.met, reasons: result.failures })
        }
        return map
    }, [dedupedFeatures, characterSnapshot, className])

    const categories: CategoryLimit<any>[] = useMemo(
        () => [{ key: 'all', label: 'selections', max: maxSelections, test: () => true }],
        [maxSelections],
    )

    // Override SelectionModal's default guard: block if prereqs not met.
    const canSelect = useCallback(
        (item: any, selectedIds: Set<string>, allItems: any[]) => {
            const prereq = prereqMap.get(item.name)
            if (prereq && !prereq.met) return false
            // Also enforce the category limit (replaces defaultCanSelect).
            const selected = allItems.filter((i) => selectedIds.has(i.name)).length
            if (selected >= maxSelections && !selectedIds.has(item.name)) return false
            return true
        },
        [prereqMap, maxSelections],
    )

    const matchItem = useCallback(
        (item: any, search: string, _filters: ActiveFilters) => {
            if (!search) return true
            return item.name.toLowerCase().includes(search.toLowerCase())
        },
        [],
    )

    const renderCard = useCallback(
        (item: any, isSelected: boolean) => {
            const prereq = prereqMap.get(item.name) ?? { met: true, reasons: [] }
            return (
                <FeatureCard
                    feature={item}
                    isSelected={isSelected}
                    prereqMet={prereq.met}
                    prereqReasons={prereq.reasons}
                />
            )
        },
        [prereqMap],
    )

    return (
        <SelectionModal
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            items={dedupedFeatures}
            getItemId={(f) => f.name}
            renderCard={renderCard}
            matchItem={matchItem}
            categories={categories}
            canSelect={canSelect}
            initialSelectedIds={initialSelectedNames}
            onConfirm={(_ids, items) => onConfirm(items.map((f) => f.name))}
        />
    )
}
