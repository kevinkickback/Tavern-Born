import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { SourceRow, SourceType } from '@/lib/provenance/types'
import { renderEntry } from '@/lib/renderer'
import { getCollapseState, setCollapseState } from '@/lib/storage/collapseState'
import { cn } from '@/lib/utils'

function renderInline(text: string): string {
  return renderEntry(text).replace(/^<p>|<\/p>$/g, '')
}

const SOURCE_TEXT_COLORS: Record<SourceType, string> = {
  race: 'text-violet-400',
  subrace: 'text-purple-400',
  class: 'text-blue-400',
  subclass: 'text-sky-400',
  background: 'text-amber-400',
  feat: 'text-green-400',
  optionalFeature: 'text-teal-400',
  manual: 'text-zinc-400',
  ASI: 'text-rose-400',
}

interface AttributionGroup {
  attribution: string
  sourceTypes: SourceType[]
  names: string[]
  isPending: boolean
}

interface CategoryGroup {
  category: string
  groups: AttributionGroup[]
}

function SourceCategoryLine({
  category,
  groups,
}: {
  category: string
  groups: AttributionGroup[]
}) {
  return (
    <div className="py-1.5 text-sm">
      <span className="font-medium">{category}: </span>
      <span className="text-muted-foreground text-xs leading-relaxed">
        {groups.map((group, gi) => {
          const colorClass =
            group.sourceTypes[0] != null ? SOURCE_TEXT_COLORS[group.sourceTypes[0]] : ''
          return (
            <span key={group.attribution}>
              {group.names.map((name, i) => (
                <span key={name}>
                  <span dangerouslySetInnerHTML={{ __html: renderInline(name) }} />
                  {i < group.names.length - 1 && ', '}
                </span>
              ))}
              <span className={cn(colorClass)}>{` (${group.attribution})`}</span>
              {gi < groups.length - 1 && ' — '}
            </span>
          )
        })}
      </span>
    </div>
  )
}

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

  useEffect(() => {
    setCollapseState(persistKey, value !== 'open')
  }, [persistKey, value])

  const groupedRows = useMemo(() => {
    const categoryOrder: string[] = []
    const categoryMap = new Map<
      string,
      Map<string, { sourceTypes: SourceType[]; names: string[]; isPending: boolean }>
    >()

    for (const row of rows) {
      let attrMap = categoryMap.get(row.category)
      if (!attrMap) {
        attrMap = new Map()
        categoryMap.set(row.category, attrMap)
        categoryOrder.push(row.category)
      }
      if (!attrMap.has(row.attribution)) {
        attrMap.set(row.attribution, {
          sourceTypes: row.sourceTypes,
          names: [],
          isPending: row.isPending,
        })
      }
      attrMap.get(row.attribution)?.names.push(row.itemName)
    }

    return categoryOrder.flatMap((category): CategoryGroup[] => {
      const attrMap = categoryMap.get(category)
      if (!attrMap) return []
      const groups: AttributionGroup[] = Array.from(attrMap.entries()).map(
        ([attribution, data]) => ({
          attribution,
          sourceTypes: data.sourceTypes,
          names: data.names,
          isPending: data.isPending,
        }),
      )
      return [{ category, groups }]
    })
  }, [rows])

  const content =
    rows.length === 0 ? (
      <p className="text-muted-foreground text-xs py-2">
        <span dangerouslySetInnerHTML={{ __html: renderInline(emptyText) }} />
      </p>
    ) : (
      <div className="divide-y divide-border/50">
        {groupedRows.map((group) => (
          <SourceCategoryLine
            key={group.category}
            category={group.category}
            groups={group.groups}
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
        <AccordionContent className="px-1">{content}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
