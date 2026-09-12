import { PushPin, X } from '@phosphor-icons/react'
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RecursiveTooltipChain } from '@/components/editor/RecursiveTooltipChain'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import {
  getEntityKey,
  getEntryWithHoverTitles,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  markRecursiveTooltipReferences,
  normalizeKind,
  parseRecursiveReference,
  type RecursiveHintState,
  type RecursiveLookup,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Spell5e } from '@/types/5etools'

const TOOLTIP_WIDTH = 320
const GAP = 4
const MARGIN = 8
const HIDE_DELAY_MS = 200
const EST_HEIGHT = 240

type HintPos = { top: number; bottom?: never } | { bottom: number; top?: never }

type HintState =
  | { kind: 'spell'; spell: Spell5e; left: number; pos: HintPos; triggerElement: HTMLElement }
  | {
      kind: 'generic'
      title: string
      subtitle?: string
      html?: string
      left: number
      pos: HintPos
      triggerElement: HTMLElement
    }

const RenderedHtml = memo(function RenderedHtml({
  className,
  html,
}: {
  className?: string
  html: string
}) {
  return (
    <div
      className={className}
      // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

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
  const [recursiveHints, setRecursiveHints] = useState<RecursiveHintState[]>([])
  const [pinned, setPinned] = useState(false)
  const pinnedRef = useRef(false)
  const suppressFocusPreviewRef = useRef(false)
  const focusPreviewOnOpenRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const previewId = useId()

  useEffect(() => {
    const trigger = hint?.triggerElement
    if (!trigger) return
    trigger.setAttribute('data-recursive-preview-active', 'true')
    trigger.setAttribute('aria-expanded', 'true')
    trigger.setAttribute('aria-controls', previewId)
    return () => {
      trigger.removeAttribute('data-recursive-preview-active')
      trigger.setAttribute('aria-expanded', 'false')
      trigger.removeAttribute('aria-controls')
    }
  }, [hint?.triggerElement, previewId])

  useEffect(() => {
    if (!hint || !focusPreviewOnOpenRef.current) return
    focusPreviewOnOpenRef.current = false
    tooltipRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [hint])

  const html = useMemo(
    () =>
      Array.isArray(entry)
        ? entry.map((item) => getEntryWithHoverTitles(item)).join('')
        : getEntryWithHoverTitles(entry),
    [entry],
  )

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
      if (!pinnedRef.current && !tooltipRef.current?.matches(':hover')) {
        setHint(null)
        setRecursiveHints([])
      }
    }, HIDE_DELAY_MS)
  }, [clearHide])

  // Tooltip content is portaled to document.body, so native listeners are more reliable here.
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

  const showPreview = useCallback(
    (el: HTMLElement) => {
      clearHide()

      const text = el.getAttribute('data-recursive-title') ?? ''
      const hoverType = el.getAttribute('data-hover-type') ?? undefined
      const hoverName = el.getAttribute('data-hover-name') ?? undefined
      const hoverSource = el.getAttribute('data-hover-source') ?? undefined
      const fallback = el.textContent?.trim() ?? ''

      const scopedReference = parseRecursiveReference(
        text,
        fallback,
        hoverType,
        hoverName,
        hoverSource,
        el.getAttribute('data-hover-class-name') ?? undefined,
        el.getAttribute('data-hover-class-source') ?? undefined,
        el.getAttribute('data-hover-subclass-name') ?? undefined,
        el.getAttribute('data-hover-subclass-source') ?? undefined,
      )
      const { left, pos } = positionNearElement(el.getBoundingClientRect())
      setRecursiveHints([])

      if (normalizeKind(scopedReference.kind) === 'spell') {
        const spell =
          recursiveLookup.spells.get(getEntityKey(scopedReference.name, scopedReference.source)) ??
          recursiveLookup.spells.get(getEntityKey(scopedReference.name))
        if (spell) {
          setHint({ kind: 'spell', spell, left, pos, triggerElement: el })
          return
        }
      }

      const resolved = getRecursiveTooltipData(
        scopedReference,
        recursiveLookup,
        text,
        formatSpellLevel,
        getSchoolName,
      )
      setHint({ kind: 'generic', ...resolved, left, pos, triggerElement: el })
    },
    [recursiveLookup, clearHide],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (pinnedRef.current) return
      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (el) showPreview(el)
    },
    [showPreview],
  )

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (suppressFocusPreviewRef.current) return
      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (el) showPreview(el)
    },
    [showPreview],
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (!el) return
      event.preventDefault()
      event.stopPropagation()
      showPreview(el)
      pinnedRef.current = true
      setPinned(true)
    },
    [showPreview],
  )

  const showRecursivePreview = useCallback(
    (target: HTMLElement) => {
      clearHide()

      const withTitle = target.closest('[data-recursive-title]') as HTMLElement | null
      const tooltip = target.closest('[data-recursive-tooltip-depth]') as HTMLElement | null
      const depth = Number(tooltip?.dataset.recursiveTooltipDepth ?? 0)

      if (!withTitle) return

      const text = withTitle.getAttribute('data-recursive-title')
      if (!text) return

      const reference = parseRecursiveReference(
        text,
        withTitle.textContent?.trim() ?? '',
        withTitle.getAttribute('data-hover-type') ?? undefined,
        withTitle.getAttribute('data-hover-name') ?? undefined,
        withTitle.getAttribute('data-hover-source') ?? undefined,
        withTitle.getAttribute('data-hover-class-name') ?? undefined,
        withTitle.getAttribute('data-hover-class-source') ?? undefined,
        withTitle.getAttribute('data-hover-subclass-name') ?? undefined,
        withTitle.getAttribute('data-hover-subclass-source') ?? undefined,
      )
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
        { ...resolved, x, y, triggerElement: withTitle },
      ])
    },
    [clearHide, recursiveLookup],
  )

  const handleRecursiveMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      showRecursivePreview(event.target as HTMLElement)
    },
    [showRecursivePreview],
  )

  const handleRecursiveFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      showRecursivePreview(event.target as HTMLElement)
    },
    [showRecursivePreview],
  )

  const handleWrapperMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const pointerDestination = e.nativeEvent.relatedTarget as Node | null
      if (pointerDestination && tooltipRef.current?.contains(pointerDestination)) return
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
    const trigger = hint?.triggerElement
    clearHide()
    pinnedRef.current = false
    setPinned(false)
    setHint(null)
    setRecursiveHints([])
    if (trigger) {
      suppressFocusPreviewRef.current = true
      trigger.focus()
      suppressFocusPreviewRef.current = false
    }
  }, [clearHide, hint?.triggerElement])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && hint) {
        event.preventDefault()
        handleClose()
        return
      }

      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (!el || (event.key !== 'Enter' && event.key !== ' ')) return

      event.preventDefault()
      focusPreviewOnOpenRef.current = true
      showPreview(el)
      pinnedRef.current = true
      setPinned(true)
    },
    [handleClose, hint, showPreview],
  )

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const destination = event.relatedTarget as Node | null
      if (
        destination &&
        (event.currentTarget.contains(destination) || tooltipRef.current?.contains(destination))
      ) {
        return
      }
      scheduleHide()
    },
    [scheduleHide],
  )

  if (!html) return null

  const totalCards = recursiveHints.length + 1
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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegates pointer, focus, and keyboard behavior to generated inline reference controls. */}
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleWrapperMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <RenderedHtml className={className} html={html} />
      </div>
      {hint
        ? createPortal(
            <div
              id={previewId}
              ref={setTooltipRef}
              role="dialog"
              aria-label={`${hint.kind === 'spell' ? hint.spell.name : hint.title} preview`}
              data-recursive-tooltip-depth={0}
              onMouseMove={handleRecursiveMouseMove}
              onFocus={handleRecursiveFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className={cn(
                'fixed z-[9999] w-[320px] max-w-[calc(100vw-1rem)] rounded border bg-card text-card-foreground transition-[box-shadow,border-color] duration-100',
                recursiveHints.length === 0
                  ? 'border-accent/70 ring-1 ring-accent/45 shadow-xl'
                  : 'border-border/80 shadow-md',
              )}
              style={{ left: hint.left, ...hint.pos }}
            >
              {hint.kind === 'spell' ? (
                <>
                  <div className="px-3 py-2 border-b border-border relative">
                    <div className="pr-16">
                      <div className="flex items-start gap-2">
                        <div className="font-semibold text-xl leading-tight">{hint.spell.name}</div>
                        {totalCards >= 3 ? (
                          <span className="mt-1 shrink-0 rounded-full border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                            1 of {totalCards}
                          </span>
                        ) : null}
                      </div>
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
                        const entryHtml = markRecursiveTooltipReferences(renderEntryCached(e))
                        return (
                          <div
                            // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
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
                      <div className="flex items-start gap-2">
                        <div className="font-semibold text-base leading-tight">{hint.title}</div>
                        {totalCards >= 3 ? (
                          <span className="shrink-0 rounded-full border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                            1 of {totalCards}
                          </span>
                        ) : null}
                      </div>
                      {hint.subtitle ? (
                        <div className="text-sm text-muted-foreground mt-0.5">{hint.subtitle}</div>
                      ) : null}
                    </div>
                    {sharedButtons}
                  </div>

                  <div className="px-3 pb-3 pt-2 text-sm leading-relaxed max-h-[220px] overflow-y-auto [&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2">
                    {hint.html ? (
                      <div
                        // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
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
              <RecursiveTooltipChain hints={recursiveHints} />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
