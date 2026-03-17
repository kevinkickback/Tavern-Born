// Subclass picker wrapping SelectionModal.
// Single-select: picking a new subclass replaces the previous selection.

import { memo, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import {
    SelectionModal,
    type ActiveFilters,
} from '@/components/ui/SelectionModal'
import { cn } from '@/lib/utils'

// ─── Card ─────────────────────────────────────────────────────────────────────

interface SubclassCardProps {
    subclass: any
    isSelected: boolean
}

const SubclassCard = memo(function SubclassCard({ subclass, isSelected }: SubclassCardProps) {
    const introText: string | undefined = Array.isArray(subclass.entries)
        ? subclass.entries.find((e: any) => typeof e === 'string')
        : undefined

    return (
        <div className="p-3.5">
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className={cn('font-semibold text-base leading-tight')}>
                    {subclass.name}
                </span>
                <div className="flex gap-1 flex-shrink-0">
                    {subclass.source && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
                            {subclass.source}
                        </Badge>
                    )}
                    {isSelected && (
                        <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">
                            ✓
                        </Badge>
                    )}
                </div>
            </div>
            {introText && (
                <p className="text-[13px] text-muted-foreground leading-snug">{introText}</p>
            )}
        </div>
    )
})

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SubclassSelectionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    subclasses: any[]
    selectedName?: string
    onConfirm: (subclass: any) => void
}

export function SubclassSelectionModal({
    open,
    onOpenChange,
    title,
    subclasses,
    selectedName,
    onConfirm,
}: SubclassSelectionModalProps) {


    const matchItem = useCallback(
        (item: any, search: string, _filters: ActiveFilters) => {
            if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
            return true
        },
        [],
    )

    const renderCard = useCallback(
        (item: any, isSelected: boolean) => (
            <SubclassCard subclass={item} isSelected={isSelected} />
        ),
        [],
    )

    // Single-select: max 1, one category covering all items.
    const categories = useMemo(
        () => [{ key: 'all', label: 'selected', max: 1, test: () => true }],
        [],
    )

    // Block selecting more than 1; already-selected item can always be toggled off.
    const canSelect = useCallback(
        (item: any, selectedIds: Set<string>) => {
            if (selectedIds.has(`${item.name}|${item.source ?? ''}`)) return true
            return selectedIds.size < 1
        },
        [],
    )

    const initialSelectedIds = useMemo(
        () => {
            if (!selectedName) return []
            const sc = subclasses.find((s) => s.name === selectedName)
            return sc ? [`${sc.name}|${sc.source ?? ''}`] : []
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selectedName, subclasses],
    )

    return (
        <SelectionModal
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            items={subclasses}
            getItemId={(sc) => `${sc.name}|${sc.source ?? ''}`}
            renderCard={renderCard}
            matchItem={matchItem}
            categories={categories}
            canSelect={canSelect}
            initialSelectedIds={initialSelectedIds}
            onConfirm={(_ids, items) => {
                if (items.length > 0) onConfirm(items[0])
            }}
        />
    )
}
