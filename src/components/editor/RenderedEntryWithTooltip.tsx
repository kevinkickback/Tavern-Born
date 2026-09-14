import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { PreviewNavigationControls } from '@/components/editor/PreviewNavigationControls'
import { RecursivePreviewShell } from '@/components/editor/RecursivePreviewShell'
import { RecursiveTooltipChain } from '@/components/editor/RecursiveTooltipChain'
import { useDraggablePreview } from '@/hooks/ui/useDraggablePreview'
import { useRecursivePreviewController } from '@/hooks/ui/useRecursivePreviewController'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { getFloatingPreviewPosition, getTitleBarSafeTop } from '@/lib/overlayPosition'
import {
  getEntryWithHoverTitles,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  markRecursiveTooltipReferences,
  normalizeKind,
  parseRecursiveReference,
  type RecursiveLookup,
  resolveRecursiveEntity,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import type { Spell5e } from '@/types/5etools'

const TOOLTIP_WIDTH = 320
const EST_HEIGHT = 240

type HintState =
  | { kind: 'spell'; spell: Spell5e; left: number; top: number; triggerElement: HTMLElement }
  | {
      kind: 'generic'
      title: string
      subtitle?: string
      html?: string
      left: number
      top: number
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

export function RenderedEntryWithTooltip({
  entry,
  className,
  recursiveLookup,
}: RenderedEntryWithTooltipProps) {
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const safeTop = getTitleBarSafeTop(uiScale)
  const [hint, setHint] = useState<HintState | null>(null)
  const suppressFocusPreviewRef = useRef(false)
  const focusPreviewOnOpenRef = useRef(false)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const previewId = useId()
  const openRoot = useCallback(() => undefined, [])
  const closeRoot = useCallback(() => setHint(null), [])
  const focusRootTrigger = useCallback(() => {
    const trigger = hint?.triggerElement
    if (!trigger) return
    suppressFocusPreviewRef.current = true
    trigger.focus()
    suppressFocusPreviewRef.current = false
  }, [hint?.triggerElement])
  const {
    appendRecursiveHint,
    clearHide,
    handleNavigate,
    handlePinToggle,
    handlePinnedPositionChange,
    handlePreviewKeyDown,
    pinAtPosition,
    pinnedDepth,
    pinnedPreview,
    recursiveHints,
    scheduleHide,
    setRecursiveHints,
  } = useRecursivePreviewController({
    isRootOpen: hint !== null,
    safeTop,
    rootRef: tooltipRef,
    onRootOpen: openRoot,
    onRootClose: closeRoot,
    onCloseFocus: focusRootTrigger,
  })

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
    tooltipRef.current?.querySelector<HTMLButtonElement>('[title="Unpin tooltip"]')?.focus()
  }, [hint])

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    const trigger = hint?.triggerElement
    if (!tooltip || !trigger || pinnedDepth !== null) return

    const updatePosition = () => {
      const position = getFloatingPreviewPosition(
        trigger.getBoundingClientRect(),
        { width: tooltip.offsetWidth || TOOLTIP_WIDTH, height: tooltip.offsetHeight || EST_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight },
        safeTop,
      )
      tooltip.style.left = `${position.left}px`
      tooltip.style.top = `${position.top}px`
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    resizeObserver?.observe(tooltip)

    return () => {
      window.removeEventListener('resize', updatePosition)
      resizeObserver?.disconnect()
    }
  }, [hint, pinnedDepth, safeTop])

  const html = useMemo(
    () =>
      Array.isArray(entry)
        ? entry.map((item) => getEntryWithHoverTitles(item)).join('')
        : getEntryWithHoverTitles(entry),
    [entry],
  )

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
      const { left, top } = getFloatingPreviewPosition(
        el.getBoundingClientRect(),
        { width: TOOLTIP_WIDTH, height: EST_HEIGHT },
        { width: window.innerWidth, height: window.innerHeight },
        safeTop,
      )
      setRecursiveHints([])

      if (normalizeKind(scopedReference.kind) === 'spell') {
        const spell = resolveRecursiveEntity(
          recursiveLookup.spells,
          scopedReference.name,
          scopedReference.source,
        )
        if (spell) {
          setHint({ kind: 'spell', spell, left, top, triggerElement: el })
          return { left, top }
        }
      }

      const resolved = getRecursiveTooltipData(
        scopedReference,
        recursiveLookup,
        text,
        formatSpellLevel,
        getSchoolName,
      )
      setHint({ kind: 'generic', ...resolved, left, top, triggerElement: el })
      return { left, top }
    },
    [recursiveLookup, clearHide, safeTop, setRecursiveHints],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (pinnedDepth !== null) return
      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (el) showPreview(el)
    },
    [pinnedDepth, showPreview],
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
      const visibleBounds =
        hint?.triggerElement === el ? tooltipRef.current?.getBoundingClientRect() : null
      pinAtPosition(0, showPreview(el), visibleBounds)
    },
    [hint?.triggerElement, pinAtPosition, showPreview],
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
      const { x, y } = getRecursiveHintPosition(withTitle, !!resolved.html, safeTop)

      appendRecursiveHint(depth, { ...resolved, x, y, triggerElement: withTitle })
    },
    [appendRecursiveHint, clearHide, recursiveLookup, safeTop],
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && hint) {
        handlePreviewKeyDown(event)
        return
      }

      const el = (event.target as HTMLElement).closest(
        '[data-recursive-title]',
      ) as HTMLElement | null
      if (!el || (event.key !== 'Enter' && event.key !== ' ')) return

      event.preventDefault()
      focusPreviewOnOpenRef.current = true
      const visibleBounds =
        hint?.triggerElement === el ? tooltipRef.current?.getBoundingClientRect() : null
      pinAtPosition(0, showPreview(el), visibleBounds)
    },
    [handlePreviewKeyDown, hint, pinAtPosition, showPreview],
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

  const rootTitle = hint?.kind === 'spell' ? hint.spell.name : hint?.title
  const historyTitles = rootTitle
    ? [rootTitle, ...recursiveHints.map((recursiveHint) => recursiveHint.title)]
    : []
  const rootPinned = pinnedDepth === 0
  const { dragHandleProps: rootDragHandleProps, dragging: rootDragging } = useDraggablePreview({
    enabled: rootPinned,
    label: rootTitle ?? 'pinned',
    position: pinnedPreview?.position ?? null,
    previewRef: tooltipRef,
    safeTop,
    onPositionChange: handlePinnedPositionChange,
  })

  if (!html) return null

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
            pinnedDepth !== null && pinnedDepth > 0 ? (
              // biome-ignore lint/a11y/noStaticElementInteractions: delegates interactions to the portaled preview and its generated inline references.
              <div
                ref={setTooltipRef}
                onMouseMove={handleRecursiveMouseMove}
                onFocus={handleRecursiveFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                <RecursiveTooltipChain
                  hints={recursiveHints}
                  index={pinnedDepth - 1}
                  historyTitles={historyTitles}
                  pinnedDepth={pinnedDepth}
                  pinnedPosition={pinnedPreview?.position ?? null}
                  mode="pinned"
                  onNavigate={handleNavigate}
                  onPinToggle={handlePinToggle}
                  onPinnedPositionChange={handlePinnedPositionChange}
                />
              </div>
            ) : (
              <RecursivePreviewShell
                id={previewId}
                ref={setTooltipRef}
                label={hint.kind === 'spell' ? hint.spell.name : hint.title}
                pinned={rootPinned}
                emphasized={rootPinned || recursiveHints.length === 0}
                position={
                  rootPinned && pinnedPreview
                    ? pinnedPreview.position
                    : { left: hint.left, top: hint.top }
                }
                onMouseMove={handleRecursiveMouseMove}
                onFocus={handleRecursiveFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
              >
                {hint.kind === 'spell' ? (
                  <>
                    <div className="border-b border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          {...(rootPinned ? rootDragHandleProps : {})}
                          className={cn(
                            'min-w-0 flex-1',
                            rootPinned && 'app-no-drag cursor-grab touch-none select-none',
                            rootDragging && 'cursor-grabbing',
                          )}
                        >
                          {rootPinned ? (
                            <div className="font-semibold text-xl leading-tight">
                              {hint.spell.name}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-left font-semibold text-xl leading-tight hover:text-accent-foreground"
                              onClick={() => handleNavigate(0)}
                              title={`Return to ${hint.spell.name}`}
                            >
                              {hint.spell.name}
                            </button>
                          )}
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            {formatSpellLevel(hint.spell.level)} {getSchoolName(hint.spell.school)}
                          </div>
                        </div>
                        <PreviewNavigationControls
                          currentDepth={0}
                          historyTitles={historyTitles}
                          pinned={rootPinned}
                          onNavigate={handleNavigate}
                          onPinToggle={handlePinToggle}
                        />
                      </div>
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
                      {[
                        ...(hint.spell.entries ?? []),
                        ...(hint.spell.entriesHigherLevel ?? []),
                      ].map((e, index) => {
                        const entryHtml = markRecursiveTooltipReferences(renderEntryCached(e))
                        return (
                          <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: Spell entry order is canonical and entries have no stable IDs.
                            key={`${hint.spell.name}|${index}|${entryHtml.slice(0, 48)}`}
                            // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
                            dangerouslySetInnerHTML={{ __html: entryHtml }}
                          />
                        )
                      })}
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
                    <div className="border-b border-border px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          {...(rootPinned ? rootDragHandleProps : {})}
                          className={cn(
                            'min-w-0 flex-1',
                            rootPinned && 'app-no-drag cursor-grab touch-none select-none',
                            rootDragging && 'cursor-grabbing',
                          )}
                        >
                          {rootPinned ? (
                            <div className="font-semibold text-base leading-tight">
                              {hint.title}
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-left font-semibold text-base leading-tight hover:text-accent-foreground"
                              onClick={() => handleNavigate(0)}
                              title={`Return to ${hint.title}`}
                            >
                              {hint.title}
                            </button>
                          )}
                          {hint.subtitle ? (
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {hint.subtitle}
                            </div>
                          ) : null}
                        </div>
                        <PreviewNavigationControls
                          currentDepth={0}
                          historyTitles={historyTitles}
                          pinned={rootPinned}
                          onNavigate={handleNavigate}
                          onPinToggle={handlePinToggle}
                        />
                      </div>
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
                {pinnedDepth === null ? (
                  <RecursiveTooltipChain
                    hints={recursiveHints}
                    historyTitles={historyTitles}
                    pinnedDepth={pinnedDepth}
                    pinnedPosition={pinnedPreview?.position ?? null}
                    onNavigate={handleNavigate}
                    onPinToggle={handlePinToggle}
                    onPinnedPositionChange={handlePinnedPositionChange}
                  />
                ) : null}
              </RecursivePreviewShell>
            ),
            document.body,
          )
        : null}
    </>
  )
}
