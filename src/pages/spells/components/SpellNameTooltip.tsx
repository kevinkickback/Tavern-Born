import { PushPin, X } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'
import {
  getEntryWithHoverTitles,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  parseRecursiveReference,
  type RecursiveHintState,
  type RecursiveLookup,
} from './spellTooltipUtils'

interface SpellNameTooltipProps {
  name: string
  spell?: Spell5e
  recursiveLookup: RecursiveLookup
  sourceContext?: string
}

export function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: SpellNameTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [recursiveHint, setRecursiveHint] = useState<RecursiveHintState | null>(null)

  const renderedEntries = useMemo(() => {
    if (!spell) return []
    const duplicateCounts = new Map<string, number>()

    return [...(spell.entries ?? []), ...(spell.entriesHigherLevel ?? [])].map((entry) => {
      const html = getEntryWithHoverTitles(entry)
      const duplicateCount = duplicateCounts.get(html) ?? 0
      duplicateCounts.set(html, duplicateCount + 1)

      return {
        html,
        key: `${spell.name}|entry|${duplicateCount}|${html.slice(0, 48)}`,
      }
    })
  }, [spell])

  const handleRecursiveHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const withTitle = target.closest('[data-recursive-title]') as HTMLElement | null
    if (!withTitle) {
      setRecursiveHint(null)
      return
    }

    const text = withTitle.getAttribute('data-recursive-title')
    if (!text) {
      setRecursiveHint(null)
      return
    }

    const hoverType = withTitle.getAttribute('data-hover-type') ?? undefined
    const hoverName = withTitle.getAttribute('data-hover-name') ?? undefined
    const hoverSource = withTitle.getAttribute('data-hover-source') ?? undefined
    const fallbackName = withTitle.textContent?.trim() ?? ''
    const reference = parseRecursiveReference(text, fallbackName, hoverType, hoverName, hoverSource)
    const resolved = getRecursiveTooltipData(
      reference,
      recursiveLookup,
      text,
      formatSpellLevel,
      getSchoolName,
    )
    const { x, y } = getRecursiveHintPosition(withTitle, !!resolved.html)

    setRecursiveHint({
      ...resolved,
      x,
      y,
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (pinned && !nextOpen) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setRecursiveHint(null)
    }
  }

  return (
    <Tooltip open={pinned || open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span className="text-sm truncate cursor-help border-b border-dotted border-muted-foreground/60 hover:border-accent">
          {name}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        onMouseMove={handleRecursiveHover}
        onMouseLeave={() => setRecursiveHint(null)}
        className="w-[320px] max-w-[calc(100vw-2rem)] p-0 !bg-card !text-card-foreground border border-border shadow-xl"
      >
        {spell ? (
          <>
            <div className="px-3 py-2 border-b border-border relative">
              <div className="pr-16">
                <div className="font-semibold text-xl leading-tight">{spell.name}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPinned((value) => !value)
                    setOpen(true)
                  }}
                  className={cn(
                    'h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 flex items-center justify-center',
                    pinned ? 'text-accent-foreground border-accent/60' : 'text-muted-foreground',
                  )}
                  title={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
                >
                  <PushPin className="h-3.5 w-3.5" weight={pinned ? 'fill' : 'regular'} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPinned(false)
                    setOpen(false)
                    setRecursiveHint(null)
                  }}
                  className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 text-muted-foreground flex items-center justify-center"
                  title="Close tooltip"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="px-3 py-2">
              <div className="rounded border border-border bg-muted/15 p-2 text-sm space-y-1">
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Casting Time:</span>
                  <span>{formatCastingTime(spell.time)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Range:</span>
                  <span>{formatRange(spell.range)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Components:</span>
                  <span>{formatComponents(spell.components)}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold min-w-[82px]">Duration:</span>
                  <span>{formatDuration(spell.duration)}</span>
                </div>
              </div>
            </div>

            <div className="px-3 pb-3 text-sm leading-relaxed space-y-1.5 max-h-[220px] overflow-y-auto">
              {renderedEntries.map((entry) => (
                <div
                  // renderEntry returns safe HTML from structured 5etools content.
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                  key={entry.key}
                  className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                />
              ))}
            </div>

            <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="text-accent-foreground text-left">
                  {sourceContext ? `Source: ${sourceContext}` : ''}
                </div>
                <div className="italic text-right">
                  {spell.source}
                  {spell.page ? ` p. ${spell.page}` : ''}
                </div>
              </div>
            </div>

            {recursiveHint ? (
              <div
                className="absolute z-[90] pointer-events-none rounded border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg w-[300px]"
                style={{
                  left: `${recursiveHint.x}px`,
                  top: `${recursiveHint.y}px`,
                }}
              >
                <div className="font-semibold text-sm leading-tight">{recursiveHint.title}</div>
                {recursiveHint.subtitle ? (
                  <div className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                    {recursiveHint.subtitle}
                  </div>
                ) : null}
                {recursiveHint.html ? (
                  <div
                    // renderEntry returns safe HTML from structured 5etools content.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: recursiveHint.html }}
                    className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
                  />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">Details unavailable.</div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
