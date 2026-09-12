import { PushPin, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RecursiveTooltipChain } from '@/components/editor/RecursiveTooltipChain'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellDisplayName,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import {
  getEntryWithHoverTitles,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  parseRecursiveReference,
  type RecursiveHintState,
  type RecursiveLookup,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

interface SpellNameTooltipProps {
  name: string
  spell?: Spell5e
  recursiveLookup: RecursiveLookup
  sourceContext?: string
}

const HIDE_DELAY_MS = 200

export function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: SpellNameTooltipProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [recursiveHints, setRecursiveHints] = useState<RecursiveHintState[]>([])
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayName = formatSpellDisplayName(name, spell?.name)

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    if (pinned) return
    clearHide()
    hideTimer.current = setTimeout(() => {
      setOpen(false)
      setRecursiveHints([])
    }, HIDE_DELAY_MS)
  }, [clearHide, pinned])

  useEffect(() => clearHide, [clearHide])

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
    const tooltip = target.closest('[data-recursive-tooltip-depth]') as HTMLElement | null
    const depth = Number(tooltip?.dataset.recursiveTooltipDepth ?? 0)
    if (!withTitle) return

    const text = withTitle.getAttribute('data-recursive-title')
    if (!text) return

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

    setRecursiveHints((current) => [
      ...current.slice(0, depth),
      {
        ...resolved,
        x,
        y,
        triggerElement: withTitle,
      },
    ])
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (pinned && !nextOpen) return
    if (nextOpen) {
      clearHide()
      setOpen(true)
      return
    }
    if (recursiveHints.length > 0) {
      scheduleHide()
      return
    }
    setOpen(nextOpen)
    setRecursiveHints([])
  }

  return (
    <Tooltip open={pinned || open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <span
          data-recursive-preview-active={pinned || open ? 'true' : undefined}
          className="text-sm truncate cursor-help border-b border-dotted border-muted-foreground/60 hover:border-accent"
        >
          {displayName}
        </span>
      </TooltipTrigger>
      <TooltipContent
        data-recursive-tooltip-depth={0}
        side="top"
        align="start"
        onMouseMove={handleRecursiveHover}
        onMouseEnter={clearHide}
        onMouseLeave={scheduleHide}
        className={cn(
          'w-[320px] max-w-[calc(100vw-2rem)] p-0 !bg-card !text-card-foreground border transition-[box-shadow,border-color] duration-100',
          recursiveHints.length === 0
            ? 'border-accent/80 ring-2 ring-accent/60 shadow-2xl'
            : 'border-border/80 shadow-md',
        )}
      >
        {spell ? (
          <>
            <div className="px-3 py-2 border-b border-border relative">
              <div className="pr-16">
                <div className="flex items-start gap-2">
                  <div className="font-semibold text-xl leading-tight">{spell.name}</div>
                  {recursiveHints.length >= 2 ? (
                    <span className="mt-1 shrink-0 rounded-full border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                      1 of {recursiveHints.length + 1}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    clearHide()
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
                    clearHide()
                    setPinned(false)
                    setOpen(false)
                    setRecursiveHints([])
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

            <RecursiveTooltipChain hints={recursiveHints} />
          </>
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground">Details unavailable.</div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
