import { PushPin, X } from '@phosphor-icons/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import {
  getEntityKey,
  getEntryWithHoverTitles,
  getRecursiveTooltipData,
  normalizeKind,
  parseRecursiveReference,
  type RecursiveLookup,
} from '@/pages/spells/components/spellTooltipUtils'
import type { Spell5e } from '@/types/5etools'

const TOOLTIP_WIDTH = 320
const GAP = 4
const MARGIN = 8
const HIDE_DELAY_MS = 200
const EST_HEIGHT = 240

type HintPos = { top: number; bottom?: never } | { bottom: number; top?: never }

type HintState =
  | { kind: 'spell'; spell: Spell5e; left: number; pos: HintPos }
  | { kind: 'generic'; title: string; subtitle?: string; html?: string; left: number; pos: HintPos }

interface RenderedEntryWithTooltipProps {
  entry: unknown
  className?: string
  recursiveLookup: RecursiveLookup
}

function positionNearElement(rect: DOMRect): { left: number; pos: HintPos } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = Math.max(MARGIN, Math.min(rect.left, vw - TOOLTIP_WIDTH - MARGIN))
  const fitsAbove = rect.top - GAP - EST_HEIGHT >= MARGIN
  const pos: HintPos = fitsAbove ? { bottom: vh - rect.top + GAP } : { top: rect.bottom + GAP }
  return { left, pos }
}

export function RenderedEntryWithTooltip({
  entry,
  className,
  recursiveLookup,
}: RenderedEntryWithTooltipProps) {
  const [hint, setHint] = useState<HintState | null>(null)
  const [pinned, setPinned] = useState(false)
  const pinnedRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  const html = useMemo(() => getEntryWithHoverTitles(entry), [entry])

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    if (pinnedRef.current) return
    clearHide()
    hideTimer.current = setTimeout(() => {
      // Guard with :hover so the tooltip stays open when the mouse is physically
      // over it, even if no JS event fired to cancel the timer (portal event edge cases).
      if (!pinnedRef.current && !tooltipRef.current?.matches(':hover')) setHint(null)
    }, HIDE_DELAY_MS)
  }, [clearHide])

  // Callback ref that wires native DOM listeners onto the portaled tooltip element.
  // React 18 delegates synthetic events to the app root; elements portaled to
  // document.body are outside that root, so onMouseEnter/onMouseLeave are unreliable.
  const setTooltipRef = useCallback(
    (el: HTMLDivElement | null) => {
      const prev = tooltipRef.current
      if (prev && prev !== el) {
        prev.removeEventListener('mouseenter', clearHide)
        prev.removeEventListener('mouseleave', scheduleHide)
      }
      tooltipRef.current = el
      if (el) {
        el.addEventListener('mouseenter', clearHide)
        el.addEventListener('mouseleave', scheduleHide)
      }
    },
    [clearHide, scheduleHide],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (pinnedRef.current) return

      const target = event.target as HTMLElement
      const el = target.closest('[data-recursive-title]') as HTMLElement | null

      if (!el) {
        // Mouse is over wrapper but not over an entity link — keep the tooltip
        // open. It will close via handleWrapperMouseLeave when the mouse exits.
        return
      }

      clearHide()

      const text = el.getAttribute('data-recursive-title') ?? ''
      const hoverType = el.getAttribute('data-hover-type') ?? undefined
      const hoverName = el.getAttribute('data-hover-name') ?? undefined
      const hoverSource = el.getAttribute('data-hover-source') ?? undefined
      const fallback = el.textContent?.trim() ?? ''

      const reference = parseRecursiveReference(text, fallback, hoverType, hoverName, hoverSource)
      const { left, pos } = positionNearElement(el.getBoundingClientRect())

      if (normalizeKind(reference.kind) === 'spell') {
        const spell =
          recursiveLookup.spells.get(getEntityKey(reference.name, reference.source)) ??
          recursiveLookup.spells.get(getEntityKey(reference.name))
        if (spell) {
          setHint({ kind: 'spell', spell, left, pos })
          return
        }
      }

      const resolved = getRecursiveTooltipData(
        reference,
        recursiveLookup,
        text,
        formatSpellLevel,
        getSchoolName,
      )
      setHint({ kind: 'generic', ...resolved, left, pos })
    },
    [recursiveLookup, clearHide],
  )

  // Check relatedTarget so we don't schedule a hide when the mouse moves into the tooltip.
  const handleWrapperMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const related = e.nativeEvent.relatedTarget as Node | null
      if (related && tooltipRef.current?.contains(related)) return
      scheduleHide()
    },
    [scheduleHide],
  )

  const handlePinToggle = useCallback(() => {
    const next = !pinnedRef.current
    pinnedRef.current = next
    setPinned(next)
    if (!next) scheduleHide()
  }, [scheduleHide])

  const handleClose = useCallback(() => {
    clearHide()
    pinnedRef.current = false
    setPinned(false)
    setHint(null)
  }, [clearHide])

  if (!html) return null

  const sharedButtons = (
    <div className="absolute top-2 right-2 flex items-center gap-1">
      <button
        type="button"
        onClick={handlePinToggle}
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
        onClick={handleClose}
        className="h-7 w-7 rounded border border-border bg-card hover:bg-muted/40 text-muted-foreground flex items-center justify-center"
        title="Close tooltip"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover tracking wrapper for tooltip triggers — no interactive action */}
      <div onMouseMove={handleMouseMove} onMouseLeave={handleWrapperMouseLeave}>
        <div
          className={className}
          // renderEntry outputs safe HTML from structured 5etools entries.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {hint
        ? createPortal(
            <div
              ref={setTooltipRef}
              role="tooltip"
              className="fixed z-[9999] w-[320px] max-w-[calc(100vw-1rem)] rounded border border-border bg-card text-card-foreground shadow-xl"
              style={{ left: hint.left, ...hint.pos }}
            >
              {hint.kind === 'spell' ? (
                <>
                  <div className="px-3 py-2 border-b border-border relative">
                    <div className="pr-16">
                      <div className="font-semibold text-xl leading-tight">{hint.spell.name}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {formatSpellLevel(hint.spell.level)} {getSchoolName(hint.spell.school)}
                      </div>
                    </div>
                    {sharedButtons}
                  </div>

                  <div className="px-3 py-2">
                    <div className="rounded border border-border bg-muted/15 p-2 text-sm space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-[82px]">Casting Time:</span>
                        <span>{formatCastingTime(hint.spell.time)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-[82px]">Range:</span>
                        <span>{formatRange(hint.spell.range)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-[82px]">Components:</span>
                        <span>{formatComponents(hint.spell.components)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold min-w-[82px]">Duration:</span>
                        <span>{formatDuration(hint.spell.duration)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-3 text-sm leading-relaxed space-y-1.5 max-h-[220px] overflow-y-auto [&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2">
                    {[...(hint.spell.entries ?? []), ...(hint.spell.entriesHigherLevel ?? [])].map(
                      (e) => {
                        const entryHtml = renderEntryCached(e)
                        return (
                          <div
                            // renderEntry outputs safe HTML from structured 5etools entries.
                            // eslint-disable-next-line react/no-danger
                            key={`${hint.spell.name}|${entryHtml.slice(0, 48)}`}
                            dangerouslySetInnerHTML={{ __html: entryHtml }}
                          />
                        )
                      },
                    )}
                  </div>

                  <div className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground">
                    <div className="flex items-start justify-between gap-3">
                      <div />
                      <div className="italic text-right">
                        {hint.spell.source}
                        {hint.spell.page ? ` p. ${hint.spell.page}` : ''}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-3 py-2 border-b border-border relative">
                    <div className="pr-16">
                      <div className="font-semibold text-base leading-tight">{hint.title}</div>
                      {hint.subtitle ? (
                        <div className="text-sm text-muted-foreground mt-0.5">{hint.subtitle}</div>
                      ) : null}
                    </div>
                    {sharedButtons}
                  </div>

                  <div className="px-3 pb-3 pt-2 text-sm leading-relaxed max-h-[220px] overflow-y-auto [&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2">
                    {hint.html ? (
                      <div
                        // renderEntry outputs safe HTML from structured 5etools entries.
                        // eslint-disable-next-line react/no-danger
                        dangerouslySetInnerHTML={{ __html: hint.html }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No description available.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
