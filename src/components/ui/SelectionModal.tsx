// Generic selection dialog — filter sidebar + scrollable inline card list + footer counters.
//
// Layout (matches fizbanes-forge SpellSelectorModal visual):
//   Header:  DialogTitle | search bar (filter-toggle + input + Clear)
//   Body:    [collapsible filter sidebar] | [scrollable card list]
//   Footer:  SELECTED label + per-category badges + status text | Cancel + Confirm
//
// The component is deliberately unopinionated — it manages selection state and
// filter sidebar UI; all item-specific logic (card rendering, match function,
// filter sections, category limits) is provided by the caller.

import { useState, useMemo, useCallback, useEffect, type ReactNode, memo } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import { Funnel, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Public types ─────────────────────────────────────────────────────────────

/** The state of all filter sections, keyed by FilterSection.key. */
export type ActiveFilters = Record<string, Set<string>>

export interface FilterOption {
    value: string
    label: string
}

export interface FilterSection {
    key: string
    label: string
    /** checkboxes: empty set = all pass, non-empty = must match one checked option.
     *  switches:   each enabled value acts as an independent AND clause. */
    type: 'checkboxes' | 'switches'
    options: FilterOption[]
    /** Number of columns for checkbox grid. Defaults to 2. */
    columns?: 1 | 2
    /** Values that should be rendered disabled (greyed out, unclickable). */
    disabledValues?: Set<string>
}

export interface CategoryLimit<T> {
    key: string
    /** Short label shown in the footer badge, e.g. "cantrips", "1st-level". */
    label: string
    /** Maximum allowed selections in this category. Use Infinity for unlimited. */
    max: number
    /** Returns true if this item belongs to this category. */
    test: (item: T) => boolean
}

export interface SelectionModalProps<T> {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    items: T[]
    getItemId: (item: T) => string
    /** Render the inner content of a card. The outer click wrapper is provided by the modal. */
    renderCard: (item: T, isSelected: boolean, canSelect: boolean) => ReactNode
    /** Return true when the item should appear given the current search + active filters. */
    matchItem: (item: T, search: string, activeFilters: ActiveFilters) => boolean
    filterSections?: FilterSection[]
    /** Optional per-category selection limits used for footer badges + default guard. */
    categories?: CategoryLimit<T>[]
    /** Override the default selection guard. Return false to block adding the item. */
    canSelect?: (item: T, selectedIds: Set<string>, allItems: T[]) => boolean
    /** IDs that are pre-selected when the dialog opens. Re-evaluated on every open. */
    initialSelectedIds?: string[]
    /** Active filter state to pre-apply when the dialog opens (e.g. level checkboxes). */
    initialFilters?: ActiveFilters
    onConfirm: (selectedIds: string[], selectedItems: T[]) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialFilters(sections: FilterSection[]): ActiveFilters {
    return Object.fromEntries(sections.map((s) => [s.key, new Set<string>()]))
}

function defaultCanSelect<T>(
    item: T,
    selectedIds: Set<string>,
    allItems: T[],
    getItemId: (item: T) => string,
    categories: CategoryLimit<T>[],
): boolean {
    for (const cat of categories) {
        if (cat.max === Infinity || !cat.test(item)) continue
        const count = allItems.filter((i) => cat.test(i) && selectedIds.has(getItemId(i))).length
        if (count >= cat.max) return false
    }
    return true
}

// ─── Inner content (remounts on every open for fresh state) ──────────────────

function SelectionModalInner<T>({
    title,
    items,
    getItemId,
    renderCard,
    matchItem,
    filterSections = [],
    categories = [],
    canSelect,
    initialSelectedIds = [],
    initialFilters,
    onConfirm,
    onClose,
}: Omit<SelectionModalProps<T>, 'open' | 'onOpenChange'> & { onClose: () => void }) {
    const [search, setSearch] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(filterSections.length > 0)
    const [activeFilters, setActiveFilters] = useState<ActiveFilters>(() => {
        const base = buildInitialFilters(filterSections)
        if (!initialFilters) return base
        return { ...base, ...initialFilters }
    })
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(initialSelectedIds),
    )

    // ── Derived ───────────────────────────────────────────────────────────────

    const filteredItems = useMemo(
        () => items.filter((item) => matchItem(item, search, activeFilters)),
        [items, search, activeFilters, matchItem],
    )

    // Batch rendering: only mount first N cards; load more on demand.
    const BATCH = 40
    const [renderLimit, setRenderLimit] = useState(BATCH)
    // Reset when search or filters change so newly-filtered results start from top.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset trigger
    useEffect(() => { setRenderLimit(BATCH) }, [search, activeFilters])
    const visibleItems = filteredItems.slice(0, renderLimit)
    const hiddenCount = filteredItems.length - visibleItems.length

    const selectedItems = useMemo(
        () => items.filter((item) => selectedIds.has(getItemId(item))),
        [items, selectedIds, getItemId],
    )

    const categoryCounts = useMemo(
        () =>
            categories.map((cat) => ({
                ...cat,
                selected: selectedItems.filter((i) => cat.test(i)).length,
            })),
        [categories, selectedItems],
    )

    // ── Selection guard ───────────────────────────────────────────────────────

    const checkCanSelect = useCallback(
        (item: T): boolean => {
            if (canSelect) return canSelect(item, selectedIds, items)
            return defaultCanSelect(item, selectedIds, items, getItemId, categories)
        },
        [canSelect, selectedIds, items, getItemId, categories],
    )

    // ── Handlers ─────────────────────────────────────────────────────────────

    const toggleItem = useCallback(
        (item: T) => {
            const id = getItemId(item)
            const alreadySelected = selectedIds.has(id)
            if (!alreadySelected && !checkCanSelect(item)) {
                toast.warning('Selection limit reached for this category.')
                return
            }
            setSelectedIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
            })
        },
        [getItemId, selectedIds, checkCanSelect],
    )

    const handleCheckbox = useCallback(
        (sectionKey: string, optionValue: string, checked: boolean) => {
            setActiveFilters((prev) => {
                const next = { ...prev, [sectionKey]: new Set(prev[sectionKey]) }
                if (checked) next[sectionKey].add(optionValue)
                else next[sectionKey].delete(optionValue)
                return next
            })
        },
        [],
    )

    const handleSwitch = useCallback(
        (sectionKey: string, optionValue: string, enabled: boolean) => {
            setActiveFilters((prev) => {
                const next = { ...prev, [sectionKey]: new Set(prev[sectionKey]) }
                if (enabled) next[sectionKey].add(optionValue)
                else next[sectionKey].delete(optionValue)
                return next
            })
        },
        [],
    )

    const clearSearch = () => setSearch('')

    const handleConfirm = () => {
        onConfirm([...selectedIds], selectedItems)
        onClose()
    }

    // ── Filter sidebar ────────────────────────────────────────────────────────

    const allAccordionKeys = filterSections.map((s) => s.key)

    const sidebar = (
        <Accordion type="multiple" defaultValue={allAccordionKeys} className="w-full">
            {filterSections.map((section) => (
                <AccordionItem
                    key={section.key}
                    value={section.key}
                    className="border-b border-border/50 last:border-b-0"
                >
                    <AccordionTrigger className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:no-underline hover:text-foreground">
                        {section.label}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3 pt-0">
                        {section.type === 'checkboxes' && (
                            <div
                                className={cn(
                                    'grid gap-y-2 gap-x-1',
                                    section.columns === 1 ? 'grid-cols-1' : 'grid-cols-2',
                                )}
                            >
                                {section.options.map((opt) => {
                                    const checked = activeFilters[section.key]?.has(opt.value) ?? false
                                    const disabled = section.disabledValues?.has(opt.value) ?? false
                                    const filterId = `sm-filter-${section.key}-${opt.value}`
                                    return (
                                        <div key={opt.value} className={cn('flex items-center gap-1.5', disabled && 'opacity-35 cursor-not-allowed')}>
                                            <Checkbox
                                                id={filterId}
                                                checked={checked}
                                                disabled={disabled}
                                                onCheckedChange={(c) =>
                                                    handleCheckbox(section.key, opt.value, !!c)
                                                }
                                                className="h-4 w-4 rounded-sm"
                                            />
                                            <Label
                                                htmlFor={filterId}
                                                className={cn('text-[13px] font-normal leading-none', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
                                            >
                                                {opt.label}
                                            </Label>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {section.type === 'switches' && (
                            <div className="space-y-2">
                                {section.options.map((opt) => {
                                    const enabled = activeFilters[section.key]?.has(opt.value) ?? false
                                    const switchId = `sm-switch-${section.key}-${opt.value}`
                                    return (
                                        <div key={opt.value} className="flex items-center gap-2">
                                            <Switch
                                                id={switchId}
                                                checked={enabled}
                                                onCheckedChange={(c) =>
                                                    handleSwitch(section.key, opt.value, c)
                                                }
                                            />
                                            <Label
                                                htmlFor={switchId}
                                                className="text-[13px] font-normal cursor-pointer"
                                            >
                                                {opt.label}
                                            </Label>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    )

    // ── Footer status text ────────────────────────────────────────────────────

    const statusText =
        selectedItems.length === 0
            ? 'No selections'
            : selectedItems
                .slice(0, 5)
                .map((i) => (i as any).name ?? getItemId(i))
                .join(', ') +
            (selectedItems.length > 5 ? `, +${selectedItems.length - 5} more` : '')

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── Header ──────────────────────────────────────────────── */}
            <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
                <DialogTitle className="font-display text-xl leading-tight">{title}</DialogTitle>
                <DialogDescription className="sr-only">
                    Browse and select items. Use the search and filters to narrow results.
                </DialogDescription>

                {/* Search row */}
                <div className="flex items-center gap-2 mt-3 pb-3 border-b border-border">
                    {filterSections.length > 0 && (
                        <Button
                            type="button"
                            variant={sidebarOpen ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                                'h-10 w-10 p-0 flex-shrink-0',
                                sidebarOpen && 'bg-accent text-accent-foreground hover:bg-accent/90',
                            )}
                            onClick={() => setSidebarOpen((v) => !v)}
                            title={sidebarOpen ? 'Hide filters' : 'Show filters'}
                        >
                            <Funnel className="h-4 w-4" weight={sidebarOpen ? 'fill' : 'regular'} />
                        </Button>
                    )}
                    <div className="relative flex-1">
                        <Input
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-10 pr-16 text-sm"
                            autoFocus
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded"
                            >
                                <X className="h-3 w-3" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </DialogHeader>

            {/* ── Body ────────────────────────────────────────────────── */}
            <div className="flex flex-row flex-1 overflow-hidden min-h-0">
                {/* Filter sidebar */}
                {filterSections.length > 0 && (
                    <div
                        className="flex-shrink-0 overflow-y-auto border-r border-border bg-muted/20 transition-all duration-200 ease-in-out"
                        style={{
                            width: sidebarOpen ? 250 : 0,
                            opacity: sidebarOpen ? 1 : 0,
                            pointerEvents: sidebarOpen ? undefined : 'none',
                        }}
                    >
                        {sidebar}
                    </div>
                )}

                {/* Card list */}
                <ScrollArea className="flex-1 overflow-hidden">
                    <div className="p-3 space-y-2">
                        {filteredItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-16">
                                No results match your filters.
                            </p>
                        ) : (
                            visibleItems.map((item) => {
                                const id = getItemId(item)
                                const isSelected = selectedIds.has(id)
                                const canSel = isSelected || checkCanSelect(item)
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => toggleItem(item)}
                                        disabled={!isSelected && !canSel}
                                        className={cn(
                                            'w-full text-left rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            isSelected
                                                ? 'border-accent bg-accent/10'
                                                : canSel
                                                    ? 'border-border hover:border-accent/50 hover:bg-accent/5'
                                                    : 'border-border opacity-40 cursor-not-allowed',
                                        )}
                                    >
                                        {renderCard(item, isSelected, canSel)}
                                    </button>
                                )
                            })
                        )}
                        {hiddenCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setRenderLimit((c) => c + BATCH)}
                                className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground text-center border border-dashed border-border hover:border-accent/40 rounded-lg transition-colors"
                            >
                                {hiddenCount} more — load next {Math.min(BATCH, hiddenCount)}
                            </button>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div className="flex-shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                            Selected
                        </span>
                        {categoryCounts.length > 0 ? (
                            categoryCounts.map((cat) => {
                                const full =
                                    cat.max !== Infinity && cat.selected >= cat.max
                                return (
                                    <Badge
                                        key={cat.key}
                                        variant={full ? 'default' : 'secondary'}
                                        className={cn(
                                            'font-mono text-sm px-2 h-6',
                                            full && 'bg-accent text-accent-foreground',
                                        )}
                                    >
                                        {cat.selected}/{cat.max === Infinity ? '∞' : cat.max}{' '}
                                        {cat.label}
                                    </Badge>
                                )
                            })
                        ) : (
                            <Badge variant="secondary" className="font-mono text-sm px-2 h-6">
                                {selectedIds.size}
                            </Badge>
                        )}
                    </div>
                    <p className="text-[13px] text-muted-foreground truncate leading-none mt-1">
                        {statusText}
                    </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                        Confirm
                    </Button>
                </div>
            </div>
        </>
    )
}

// ─── Public component ─────────────────────────────────────────────────────────
// The Dialog wrapper is separate so DialogContent is always in the tree for
// Radix animations. The inner content remounts on every open via `key` to give
// fresh state without needing effect-based resets.

export function SelectionModal<T>(props: SelectionModalProps<T>) {
    const { open, onOpenChange, ...rest } = props

    // Increment each time the dialog opens — forces SelectionModalInner to
    // remount with fresh state while keeping the Dialog/DialogContent mounted
    // for close animations.
    const [mountKey, setMountKey] = useState(0)

    useEffect(() => {
        if (open) {
            setMountKey((k) => k + 1)
        }
    }, [open]) // eslint-disable-line react-hooks/exhaustive-deps — only track open transitions

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex flex-col gap-0 p-0 overflow-hidden max-h-[90vh] sm:max-w-5xl w-full">
                <SelectionModalInner
                    key={mountKey}
                    {...rest}
                    onClose={() => onOpenChange(false)}
                />
            </DialogContent>
        </Dialog>
    )
}
