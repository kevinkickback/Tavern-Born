import { useState, useEffect, useMemo } from 'react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion'
import { renderEntry } from '@/lib/renderer'
import { getCollapseState, setCollapseState } from '@/lib/storage/collapseState'
import type { SourceRow } from '@/lib/provenance/types'

// ── Sub-components ────────────────────────────────────────────────────────────

function renderInline(text: string): string {
    return renderEntry(text).replace(/^<p>|<\/p>$/g, '')
}

function SourceCategoryLine({ category, items }: { category: string; items: string[] }) {
    return (
        <div className="py-1.5 text-sm">
            <span className="font-medium">{category}: </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
                {items.map((item, idx) => (
                    <span key={`${category}-${idx}`}>
                        <span dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
                        {idx < items.length - 1 ? ', ' : ''}
                    </span>
                ))}
            </span>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SourcesAccordionProps {
    /** Stable identifier used to persist collapsed state per section. */
    sectionId: string
    /** Panel heading. Defaults to "Sources". */
    title?: string
    /** Rows to render. */
    rows: SourceRow[]
    /** Text shown when rows is empty. */
    emptyText?: string
    /** Initial collapsed state when no persisted value exists. */
    defaultCollapsed?: boolean
}

/**
 * Collapsible Sources accordion rendered at the bottom of a card/section.
 * Persists its collapsed state to localStorage by sectionId.
 */
export function SourcesAccordion({
    sectionId,
    title = 'Sources',
    rows,
    emptyText = 'No source attribution recorded yet.',
    defaultCollapsed = true,
}: SourcesAccordionProps) {
    const persistKey = `sources:${sectionId}`
    const [value, setValue] = useState<string>(() =>
        getCollapseState(persistKey, defaultCollapsed) ? '' : 'open',
    )

    // Sync → persist on change
    useEffect(() => {
        setCollapseState(persistKey, value !== 'open')
    }, [persistKey, value])

    const groupedRows = useMemo(() => {
        const categoryOrder: string[] = []
        const categoryMap = new Map<string, Map<string, { attributions: Set<string> }>>()

        for (const row of rows) {
            if (!categoryMap.has(row.category)) {
                categoryMap.set(row.category, new Map())
                categoryOrder.push(row.category)
            }
            const itemMap = categoryMap.get(row.category)!
            if (!itemMap.has(row.itemName)) {
                itemMap.set(row.itemName, { attributions: new Set() })
            }
            const entry = itemMap.get(row.itemName)!
            entry.attributions.add(row.attribution)
        }

        return categoryOrder.map((category) => {
            const itemMap = categoryMap.get(category)!
            const items = Array.from(itemMap.entries()).map(([itemName, entry]) => {
                const attribution = Array.from(entry.attributions).join(', ')
                return `${itemName} (${attribution})`
            })
            return { category, items }
        })
    }, [rows])

    const content = rows.length === 0 ? (
        <p className="text-muted-foreground text-xs py-2">
            <span dangerouslySetInnerHTML={{ __html: renderInline(emptyText) }} />
        </p>
    ) : (
        <div className="divide-y divide-border/50">
            {groupedRows.map((group) => (
                <SourceCategoryLine
                    key={group.category}
                    category={group.category}
                    items={group.items}
                />
            ))}
        </div>
    )

    return (
        <Accordion
            type="single"
            collapsible
            value={value}
            onValueChange={(v) => setValue(v)}
            className="mt-4"
        >
            <AccordionItem value="open" className="border-b-0">
                <AccordionTrigger className="px-1 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline hover:text-foreground">
                    <span className="flex items-center gap-2">
                        {title}
                        {rows.length > 0 && (
                            <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
                                {rows.length}
                            </span>
                        )}
                    </span>
                </AccordionTrigger>
                <AccordionContent className="px-1">
                    {content}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    )
}
