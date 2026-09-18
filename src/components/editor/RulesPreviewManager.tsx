import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/react-dom'
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { PreviewPinButton } from '@/components/editor/PreviewPinButton'
import { RenderedHtml } from '@/components/editor/RenderedHtml'
import { RulesPreviewShell } from '@/components/editor/RulesPreviewShell'
import {
  initialRulesPreviewState,
  type RulesPreviewDescriptor,
  rulesPreviewReducer,
  type TransientRulesPreview,
} from '@/components/editor/rulesPreviewState'
import { useDraggablePreview } from '@/hooks/ui/useDraggablePreview'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  formatSpellLevel,
  getSchoolName,
} from '@/lib/calculations/spellUtils'
import {
  getAnchoredPreviewFallbackPosition,
  getCollisionAvoidingPreviewPosition,
  getTitleBarSafeTop,
  type PreviewBounds,
  type PreviewPosition,
} from '@/lib/overlayPosition'
import {
  getEntryWithHoverTitles,
  getRecursiveTooltipData,
  normalizeKind,
  parseRecursiveReference,
  type RecursiveLookup,
  resolveRecursiveEntity,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import type { Spell5e } from '@/types/5etools'

const PREVIEW_WIDTH = 320
const PREVIEW_ESTIMATED_HEIGHT = 260
const PREVIEW_GAP = 8
const PREVIEW_CLOSE_DELAY = 180
const PREVIEW_HOVER_INTENT_DELAY = 120
const PINNED_PREVIEW_ID = 'rules-preview-pinned'

interface RulesPreviewContextValue {
  cancelClose: () => void
  openPreview: (descriptor: RulesPreviewDescriptor, sourceElement: HTMLElement) => void
  pinPreview: (
    descriptor: RulesPreviewDescriptor,
    sourceElement: HTMLElement,
    focusPinned?: boolean,
  ) => void
  scheduleClose: () => void
}

const noOp = () => undefined
const fallbackContext: RulesPreviewContextValue = {
  cancelClose: noOp,
  openPreview: noOp,
  pinPreview: noOp,
  scheduleClose: noOp,
}

const RulesPreviewContext = createContext<RulesPreviewContextValue>(fallbackContext)

function toBounds(rect: DOMRect | DOMRectReadOnly): PreviewBounds {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function getInitialPosition(
  bounds: PreviewBounds,
  safeTop: number,
  placement: 'top-start' | 'right-start',
): PreviewPosition {
  return getAnchoredPreviewFallbackPosition(
    bounds,
    { width: PREVIEW_WIDTH, height: PREVIEW_ESTIMATED_HEIGHT },
    { width: window.innerWidth, height: window.innerHeight },
    safeTop,
    placement,
    placement === 'right-start' ? PREVIEW_GAP : 4,
  )
}

export function getRulesPreviewDescriptor(
  trigger: HTMLElement,
  recursiveLookup: RecursiveLookup,
): RulesPreviewDescriptor | null {
  const rawTitle = trigger.getAttribute('data-recursive-title')
  if (!rawTitle) return null

  const reference = parseRecursiveReference(
    rawTitle,
    trigger.textContent?.trim() ?? '',
    trigger.getAttribute('data-hover-type') ?? undefined,
    trigger.getAttribute('data-hover-name') ?? undefined,
    trigger.getAttribute('data-hover-source') ?? undefined,
    trigger.getAttribute('data-hover-class-name') ?? undefined,
    trigger.getAttribute('data-hover-class-source') ?? undefined,
    trigger.getAttribute('data-hover-subclass-name') ?? undefined,
    trigger.getAttribute('data-hover-subclass-source') ?? undefined,
  )

  if (normalizeKind(reference.kind) === 'spell') {
    const spell = resolveRecursiveEntity(recursiveLookup.spells, reference.name, reference.source)
    if (spell) return getSpellPreviewDescriptor(spell, recursiveLookup)
  }

  const resolved = getRecursiveTooltipData(
    reference,
    recursiveLookup,
    rawTitle,
    formatSpellLevel,
    getSchoolName,
  )
  return {
    key: `${reference.kind}|${reference.name}|${reference.source ?? ''}|${reference.className ?? ''}|${reference.subclassName ?? ''}`.toLowerCase(),
    kind: 'generic',
    ...resolved,
    recursiveLookup,
  }
}

export function getSpellPreviewDescriptor(
  spell: Spell5e,
  recursiveLookup: RecursiveLookup,
  sourceContext?: string,
): RulesPreviewDescriptor {
  return {
    key: `spell|${spell.name}|${spell.source ?? ''}`.toLowerCase(),
    kind: 'spell',
    title: spell.name,
    spell,
    sourceContext,
    recursiveLookup,
  }
}

interface PreviewContentsProps {
  descriptor: RulesPreviewDescriptor
  dragHandleProps?: ReturnType<typeof useDraggablePreview>['dragHandleProps']
  dragging?: boolean
  onPinToggle: () => void
  pinned: boolean
}

function PreviewContents({
  descriptor,
  dragHandleProps,
  dragging = false,
  onPinToggle,
  pinned,
}: PreviewContentsProps) {
  const titleClassName = cn(
    'min-w-0 flex-1',
    dragHandleProps && 'app-no-drag cursor-grab touch-none select-none',
    dragging && 'cursor-grabbing',
  )

  if (descriptor.kind === 'spell') {
    const { spell } = descriptor
    const duplicateCounts = new Map<string, number>()
    const renderedEntries = [...(spell.entries ?? []), ...(spell.entriesHigherLevel ?? [])].map(
      (entry) => {
        const html = getEntryWithHoverTitles(entry)
        const duplicateCount = duplicateCounts.get(html) ?? 0
        duplicateCounts.set(html, duplicateCount + 1)
        return { html, key: `${descriptor.key}|${duplicateCount}|${html.slice(0, 48)}` }
      },
    )

    return (
      <>
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div {...dragHandleProps} className={titleClassName}>
              <div className="font-semibold text-xl leading-tight">{spell.name}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
              </div>
            </div>
            <PreviewPinButton pinned={pinned} onPinToggle={onPinToggle} />
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="space-y-1 rounded border border-border bg-muted/15 p-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="min-w-[82px] font-semibold">Casting Time:</span>
              <span>{formatCastingTime(spell.time)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="min-w-[82px] font-semibold">Range:</span>
              <span>{formatRange(spell.range)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="min-w-[82px] font-semibold">Components:</span>
              <span>{formatComponents(spell.components)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="min-w-[82px] font-semibold">Duration:</span>
              <span>{formatDuration(spell.duration)}</span>
            </div>
          </div>
        </div>
        <div
          data-rules-preview-scroll
          className="max-h-[220px] space-y-1.5 overflow-y-auto px-3 pb-3 text-sm leading-relaxed"
        >
          {renderedEntries.map((entry) => (
            <RenderedHtml
              key={entry.key}
              html={entry.html}
              className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1"
            />
          ))}
        </div>
        <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="text-left text-accent-foreground">
              {descriptor.sourceContext ? `Source: ${descriptor.sourceContext}` : ''}
            </div>
            <div className="text-right italic">
              {spell.source}
              {spell.page ? ` p. ${spell.page}` : ''}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div {...dragHandleProps} className={titleClassName}>
            <div className="font-semibold text-base leading-tight">{descriptor.title}</div>
            {descriptor.subtitle ? (
              <div className="mt-0.5 text-sm text-muted-foreground">{descriptor.subtitle}</div>
            ) : null}
          </div>
          <PreviewPinButton pinned={pinned} onPinToggle={onPinToggle} />
        </div>
      </div>
      <div
        data-rules-preview-scroll
        className="max-h-[220px] overflow-y-auto px-3 pb-3 pt-2 text-sm leading-relaxed"
      >
        {descriptor.html ? (
          <RenderedHtml
            html={descriptor.html}
            className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1"
          />
        ) : (
          <p className="text-xs italic text-muted-foreground">No description available.</p>
        )}
      </div>
    </>
  )
}

interface PreviewSurfaceProps {
  descriptor: RulesPreviewDescriptor
  emphasized: boolean
  hasChild: boolean
  id: string
  layer: 'pinned' | 'transient'
  onPinToggle: () => void
  position: PreviewPosition
  previewRef: RefObject<HTMLDivElement | null>
  safeTop: number
  onPinnedPositionChange: (position: PreviewPosition) => void
  onReferenceImmediate: (trigger: HTMLElement) => void
  onReferenceIntent: (trigger: HTMLElement) => void
  onReferenceIntentCancel: () => void
  onReferenceLeave: () => void
  onReferencePin: (trigger: HTMLElement) => void
  cancelClose: () => void
  scheduleClose: () => void
}

function PreviewSurface({
  descriptor,
  emphasized,
  hasChild,
  id,
  layer,
  onPinToggle,
  position,
  previewRef,
  safeTop,
  onPinnedPositionChange,
  onReferenceImmediate,
  onReferenceIntent,
  onReferenceIntentCancel,
  onReferenceLeave,
  onReferencePin,
  cancelClose,
  scheduleClose,
}: PreviewSurfaceProps) {
  const pinned = layer === 'pinned'
  const { dragHandleProps, dragging } = useDraggablePreview({
    enabled: pinned,
    label: descriptor.title,
    position: pinned ? position : null,
    previewRef,
    safeTop,
    onPositionChange: onPinnedPositionChange,
  })

  const findReference = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>('[data-recursive-title]') : null

  return (
    <RulesPreviewShell
      id={id}
      ref={previewRef}
      label={descriptor.title}
      layer={layer}
      position={position}
      emphasized={emphasized}
      onMouseEnter={cancelClose}
      onMouseLeave={() => {
        onReferenceIntentCancel()
        scheduleClose()
      }}
      onMouseMove={(event) => {
        const trigger = findReference(event.target)
        if (trigger && event.currentTarget.contains(trigger)) {
          onReferenceIntent(trigger)
        } else {
          onReferenceIntentCancel()
          if (hasChild) onReferenceLeave()
          else cancelClose()
        }
      }}
      onFocus={(event) => {
        const trigger = findReference(event.target)
        if (trigger && event.currentTarget.contains(trigger)) onReferenceImmediate(trigger)
      }}
      onClick={(event) => {
        const trigger = findReference(event.target)
        if (!trigger || !event.currentTarget.contains(trigger)) return
        event.preventDefault()
        event.stopPropagation()
        onReferencePin(trigger)
      }}
      onKeyDown={(event) => {
        const trigger = findReference(event.target)
        if (!trigger || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        event.stopPropagation()
        onReferencePin(trigger)
      }}
    >
      <PreviewContents
        descriptor={descriptor}
        dragHandleProps={pinned ? dragHandleProps : undefined}
        dragging={dragging}
        onPinToggle={onPinToggle}
        pinned={pinned}
      />
    </RulesPreviewShell>
  )
}

interface FloatingPreviewSurfaceProps {
  avoidElementIds: string
  cancelClose: () => void
  emphasized: boolean
  hasChild: boolean
  onMove: (id: string, position: PreviewPosition) => void
  onPin: (id: string) => void
  onReferenceImmediate: (trigger: HTMLElement, lookup: RecursiveLookup) => void
  onReferenceIntent: (trigger: HTMLElement, lookup: RecursiveLookup) => void
  onReferenceIntentCancel: () => void
  onReferenceLeave: (id: string) => void
  onReferencePin: (trigger: HTMLElement, lookup: RecursiveLookup) => void
  preview: TransientRulesPreview
  safeTop: number
  scheduleClose: () => void
}

function FloatingPreviewSurface({
  avoidElementIds,
  cancelClose,
  emphasized,
  hasChild,
  onMove,
  onPin,
  onReferenceImmediate,
  onReferenceIntent,
  onReferenceIntentCancel,
  onReferenceLeave,
  onReferencePin,
  preview,
  safeTop,
  scheduleClose,
}: FloatingPreviewSurfaceProps) {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const { anchor, anchorBounds, id, placement, positionLocked } = preview

  useLayoutEffect(() => {
    const element = previewRef.current
    if (!element || !anchor || positionLocked) return

    const gap = placement === 'right-start' ? PREVIEW_GAP : 4
    const liveAnchorBounds = anchor.isConnected
      ? toBounds(anchor.getBoundingClientRect())
      : anchorBounds
    const overlaySize = {
      width: element.getBoundingClientRect().width || PREVIEW_WIDTH,
      height: element.getBoundingClientRect().height || PREVIEW_ESTIMATED_HEIGHT,
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const getObstacleBounds = () =>
      avoidElementIds.split('|').flatMap((elementId) => {
        if (!elementId) return []
        const obstacle = document.getElementById(elementId)
        return obstacle?.isConnected ? [toBounds(obstacle.getBoundingClientRect())] : []
      })
    const fallback = getCollisionAvoidingPreviewPosition(
      getAnchoredPreviewFallbackPosition(
        liveAnchorBounds,
        overlaySize,
        viewport,
        safeTop,
        placement,
        gap,
      ),
      liveAnchorBounds,
      overlaySize,
      viewport,
      safeTop,
      getObstacleBounds(),
      PREVIEW_GAP,
    )
    onMove(id, fallback)

    if (!anchor.isConnected) return
    let active = true
    const cleanup = autoUpdate(anchor, element, () => {
      void computePosition(anchor, element, {
        placement,
        strategy: 'fixed',
        middleware: [
          offset(gap),
          flip({ padding: { top: safeTop, right: 8, bottom: 8, left: 8 } }),
          shift({ padding: { top: safeTop, right: 8, bottom: 8, left: 8 } }),
        ],
      }).then(({ x, y }) => {
        if (!active || !element.isConnected) return
        const currentAnchorBounds = anchor.isConnected
          ? toBounds(anchor.getBoundingClientRect())
          : anchorBounds
        onMove(
          id,
          getCollisionAvoidingPreviewPosition(
            { left: x, top: y },
            currentAnchorBounds,
            {
              width: element.getBoundingClientRect().width || PREVIEW_WIDTH,
              height: element.getBoundingClientRect().height || PREVIEW_ESTIMATED_HEIGHT,
            },
            { width: window.innerWidth, height: window.innerHeight },
            safeTop,
            getObstacleBounds(),
            PREVIEW_GAP,
          ),
        )
      })
    })
    return () => {
      active = false
      cleanup()
    }
  }, [onMove, anchor, anchorBounds, avoidElementIds, id, placement, positionLocked, safeTop])

  useEffect(() => {
    const source = preview.sourceElement
    if (!source?.isConnected) return
    source.setAttribute('data-rules-preview-active', 'true')
    source.setAttribute('aria-expanded', 'true')
    source.setAttribute('aria-controls', preview.id)
    return () => {
      source.removeAttribute('data-rules-preview-active')
      source.setAttribute('aria-expanded', 'false')
      source.removeAttribute('aria-controls')
    }
  }, [preview.id, preview.sourceElement])

  return (
    <PreviewSurface
      id={preview.id}
      descriptor={preview.descriptor}
      emphasized={emphasized}
      hasChild={hasChild}
      layer="transient"
      onPinToggle={() => onPin(preview.id)}
      position={preview.position}
      previewRef={previewRef}
      safeTop={safeTop}
      onPinnedPositionChange={() => undefined}
      onReferenceImmediate={(trigger) =>
        onReferenceImmediate(trigger, preview.descriptor.recursiveLookup)
      }
      onReferenceIntent={(trigger) =>
        onReferenceIntent(trigger, preview.descriptor.recursiveLookup)
      }
      onReferenceIntentCancel={onReferenceIntentCancel}
      onReferenceLeave={() => onReferenceLeave(preview.id)}
      onReferencePin={(trigger) => onReferencePin(trigger, preview.descriptor.recursiveLookup)}
      cancelClose={cancelClose}
      scheduleClose={scheduleClose}
    />
  )
}

function getCorridorStyle(from: DOMRect, to: DOMRect): CSSProperties | null {
  const verticalTop = Math.min(from.top, to.top)
  const verticalBottom = Math.max(from.bottom, to.bottom)
  const verticalSpan = verticalBottom - verticalTop
  if (from.right <= to.left || to.right <= from.left) {
    const fromIsLeft = from.right <= to.left
    const left = (fromIsLeft ? from.right : to.right) - 2
    const right = (fromIsLeft ? to.left : from.left) + 2
    const leftRect = fromIsLeft ? from : to
    const rightRect = fromIsLeft ? to : from
    const leftTop = ((leftRect.top - verticalTop) / verticalSpan) * 100
    const leftBottom = ((leftRect.bottom - verticalTop) / verticalSpan) * 100
    const rightTop = ((rightRect.top - verticalTop) / verticalSpan) * 100
    const rightBottom = ((rightRect.bottom - verticalTop) / verticalSpan) * 100
    return {
      left,
      top: verticalTop,
      width: right - left,
      height: verticalSpan,
      clipPath: `polygon(0 ${leftTop}%, 100% ${rightTop}%, 100% ${rightBottom}%, 0 ${leftBottom}%)`,
    }
  }

  if (from.bottom <= to.top || to.bottom <= from.top) {
    const fromIsTop = from.bottom <= to.top
    const top = (fromIsTop ? from.bottom : to.bottom) - 2
    const bottom = (fromIsTop ? to.top : from.top) + 2
    const topRect = fromIsTop ? from : to
    const bottomRect = fromIsTop ? to : from
    const horizontalLeft = Math.min(from.left, to.left)
    const horizontalRight = Math.max(from.right, to.right)
    const horizontalSpan = horizontalRight - horizontalLeft
    const topLeft = ((topRect.left - horizontalLeft) / horizontalSpan) * 100
    const topRight = ((topRect.right - horizontalLeft) / horizontalSpan) * 100
    const bottomLeft = ((bottomRect.left - horizontalLeft) / horizontalSpan) * 100
    const bottomRight = ((bottomRect.right - horizontalLeft) / horizontalSpan) * 100
    return {
      left: horizontalLeft,
      top,
      width: horizontalSpan,
      height: bottom - top,
      clipPath: `polygon(${topLeft}% 0, ${topRight}% 0, ${bottomRight}% 100%, ${bottomLeft}% 100%)`,
    }
  }
  return null
}

function PreviewCorridor({
  cancelClose,
  fromId,
  scheduleClose,
  toId,
}: {
  cancelClose: () => void
  fromId: string
  scheduleClose: () => void
  toId: string
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const from = document.getElementById(fromId)
    const to = document.getElementById(toId)
    if (!from || !to) return
    const update = () => {
      const next = getCorridorStyle(from.getBoundingClientRect(), to.getBoundingClientRect())
      setStyle((current) =>
        current?.left === next?.left &&
        current?.top === next?.top &&
        current?.width === next?.width &&
        current?.height === next?.height
          ? current
          : next,
      )
    }
    update()
    return autoUpdate(from, to, update)
  }, [fromId, toId])

  if (!style) return null
  return (
    <div
      aria-hidden="true"
      data-rules-preview-corridor={`${fromId}:${toId}`}
      className="pointer-events-auto fixed z-[9998]"
      style={style}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    />
  )
}

export function RulesPreviewManager({ children }: { children: ReactNode }) {
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const safeTop = getTitleBarSafeTop(uiScale)
  const [state, dispatch] = useReducer(rulesPreviewReducer, initialRulesPreviewState)
  const stateRef = useRef(state)
  const pinnedRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentTriggerRef = useRef<HTMLElement | null>(null)
  const previewSequenceRef = useRef(0)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const focusPinnedRef = useRef(false)
  stateRef.current = state

  const cancelClose = useCallback(() => {
    if (hideTimerRef.current === null) return
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }, [])

  const scheduleClose = useCallback(() => {
    cancelClose()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      dispatch({ type: 'close-chain' })
    }, PREVIEW_CLOSE_DELAY)
  }, [cancelClose])

  const scheduleDescendantsClose = useCallback(
    (parentId: string) => {
      cancelClose()
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null
        dispatch({ type: 'close-descendants', parentId })
      }, PREVIEW_CLOSE_DELAY)
    },
    [cancelClose],
  )

  const cancelReferenceIntent = useCallback(() => {
    if (intentTimerRef.current !== null) clearTimeout(intentTimerRef.current)
    intentTimerRef.current = null
    intentTriggerRef.current = null
  }, [])

  useEffect(
    () => () => {
      cancelClose()
      cancelReferenceIntent()
    },
    [cancelClose, cancelReferenceIntent],
  )

  useEffect(() => {
    if (state.chain.length === 0) return
    const handlePointerMove = (event: MouseEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('[data-rules-preview-layer], [data-rules-preview-corridor]')
      ) {
        return
      }
      scheduleClose()
    }
    document.addEventListener('mousemove', handlePointerMove, true)
    return () => document.removeEventListener('mousemove', handlePointerMove, true)
  }, [scheduleClose, state.chain.length])

  const openPreview = useCallback(
    (descriptor: RulesPreviewDescriptor, sourceElement: HTMLElement) => {
      cancelClose()
      const current = stateRef.current
      if (current.pinned?.descriptor.key === descriptor.key) {
        dispatch({ type: 'close-chain' })
        return
      }

      const sourceLayer = sourceElement.closest<HTMLElement>('[data-rules-preview-layer]')
      const parentId = sourceLayer?.id ?? null
      const parentIsManaged =
        parentId === PINNED_PREVIEW_ID || current.chain.some((preview) => preview.id === parentId)
      const newest = current.chain[current.chain.length - 1]
      if (newest?.descriptor.key === descriptor.key && newest.sourceElement === sourceElement)
        return

      const anchor = (parentIsManaged ? sourceLayer : sourceElement) ?? sourceElement
      const placement = parentIsManaged ? 'right-start' : 'top-start'
      const anchorBounds = toBounds(anchor.getBoundingClientRect())
      const id = `rules-preview-${++previewSequenceRef.current}`
      const preview = {
        id,
        parentId: parentIsManaged ? parentId : null,
        anchor,
        anchorBounds,
        descriptor,
        placement,
        position: getInitialPosition(anchorBounds, safeTop, placement),
        positionLocked: false,
        sourceElement,
      } as const

      dispatch(
        parentIsManaged && parentId
          ? { type: 'open-child', parentId, preview }
          : { type: 'open-root', preview },
      )
    },
    [cancelClose, safeTop],
  )

  const pinPreview = useCallback(
    (descriptor: RulesPreviewDescriptor, sourceElement: HTMLElement, focusPinned = false) => {
      cancelClose()
      cancelReferenceIntent()
      const current = stateRef.current
      const matchingPreview = [...current.chain]
        .reverse()
        .find((preview) => preview.descriptor.key === descriptor.key)
      const transientBounds = matchingPreview
        ? document.getElementById(matchingPreview.id)?.getBoundingClientRect()
        : null
      const sourceLayer = sourceElement.closest<HTMLElement>('[data-rules-preview-layer]')
      const sourceBounds = toBounds(
        transientBounds ??
          sourceLayer?.getBoundingClientRect() ??
          sourceElement.getBoundingClientRect(),
      )
      const hasMeasuredTransient = Boolean(
        transientBounds && (transientBounds.width > 0 || transientBounds.height > 0),
      )
      const position =
        hasMeasuredTransient && transientBounds
          ? { left: transientBounds.left, top: transientBounds.top }
          : getInitialPosition(sourceBounds, safeTop, 'top-start')

      returnFocusRef.current = sourceElement
      focusPinnedRef.current = focusPinned
      dispatch({ type: 'pin', preview: { descriptor, position } })
    },
    [cancelClose, cancelReferenceIntent, safeTop],
  )

  const pinTransient = useCallback((id: string) => {
    const transient = stateRef.current.chain.find((preview) => preview.id === id)
    if (!transient) return
    const bounds = document.getElementById(id)?.getBoundingClientRect()
    const hasMeasuredBounds = Boolean(bounds && (bounds.width > 0 || bounds.height > 0))
    focusPinnedRef.current = true
    dispatch({
      type: 'pin',
      preview: {
        descriptor: transient.descriptor,
        position:
          hasMeasuredBounds && bounds ? { left: bounds.left, top: bounds.top } : transient.position,
      },
    })
  }, [])

  const unpin = useCallback(() => {
    const pinned = stateRef.current.pinned
    if (!pinned) return
    const bounds = pinnedRef.current?.getBoundingClientRect()
    const anchorBounds: PreviewBounds = bounds
      ? toBounds(bounds)
      : { ...pinned.position, width: PREVIEW_WIDTH, height: PREVIEW_ESTIMATED_HEIGHT }
    dispatch({
      type: 'unpin',
      preview: {
        id: `rules-preview-${++previewSequenceRef.current}`,
        parentId: null,
        anchor: null,
        anchorBounds,
        descriptor: pinned.descriptor,
        placement: 'top-start',
        position: pinned.position,
        positionLocked: true,
        sourceElement: null,
      },
    })
  }, [])

  const movePinned = useCallback((position: PreviewPosition) => {
    dispatch({ type: 'move-pinned', position })
  }, [])

  const moveTransient = useCallback((id: string, position: PreviewPosition) => {
    dispatch({ type: 'move-preview', id, position })
  }, [])

  useEffect(() => {
    if (!state.pinned || !focusPinnedRef.current) return
    focusPinnedRef.current = false
    pinnedRef.current?.querySelector<HTMLButtonElement>('[title="Unpin tooltip"]')?.focus()
  }, [state.pinned])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const current = stateRef.current
      if (current.chain.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        dispatch({ type: 'close-newest' })
        return
      }
      if (!current.pinned) return
      event.preventDefault()
      event.stopPropagation()
      dispatch({ type: 'close-pinned' })
      const returnFocus = returnFocusRef.current
      if (returnFocus?.isConnected) returnFocus.focus()
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [])

  const openReference = useCallback(
    (trigger: HTMLElement, lookup: RecursiveLookup) => {
      const descriptor = getRulesPreviewDescriptor(trigger, lookup)
      if (descriptor) openPreview(descriptor, trigger)
    },
    [openPreview],
  )

  const openReferenceWithIntent = useCallback(
    (trigger: HTMLElement, lookup: RecursiveLookup) => {
      if (intentTriggerRef.current === trigger) return
      cancelReferenceIntent()
      intentTriggerRef.current = trigger
      intentTimerRef.current = setTimeout(() => {
        intentTimerRef.current = null
        const descriptor = getRulesPreviewDescriptor(trigger, lookup)
        if (descriptor && trigger.isConnected) openPreview(descriptor, trigger)
      }, PREVIEW_HOVER_INTENT_DELAY)
    },
    [cancelReferenceIntent, openPreview],
  )

  const pinReference = useCallback(
    (trigger: HTMLElement, lookup: RecursiveLookup) => {
      const descriptor = getRulesPreviewDescriptor(trigger, lookup)
      if (descriptor) pinPreview(descriptor, trigger, true)
    },
    [pinPreview],
  )

  const context = useMemo<RulesPreviewContextValue>(
    () => ({ cancelClose, openPreview, pinPreview, scheduleClose }),
    [cancelClose, openPreview, pinPreview, scheduleClose],
  )

  const pinnedPreview = state.pinned
  const previewChain = state.chain
  const portal =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <>
            {pinnedPreview ? (
              <PreviewSurface
                id={PINNED_PREVIEW_ID}
                descriptor={pinnedPreview.descriptor}
                emphasized={previewChain.length === 0}
                hasChild={previewChain[0]?.parentId === PINNED_PREVIEW_ID}
                layer="pinned"
                onPinToggle={unpin}
                position={pinnedPreview.position}
                previewRef={pinnedRef}
                safeTop={safeTop}
                onPinnedPositionChange={movePinned}
                onReferenceImmediate={(trigger) =>
                  openReference(trigger, pinnedPreview.descriptor.recursiveLookup)
                }
                onReferenceIntent={(trigger) =>
                  openReferenceWithIntent(trigger, pinnedPreview.descriptor.recursiveLookup)
                }
                onReferenceIntentCancel={cancelReferenceIntent}
                onReferenceLeave={() => scheduleDescendantsClose(PINNED_PREVIEW_ID)}
                onReferencePin={(trigger) =>
                  pinReference(trigger, pinnedPreview.descriptor.recursiveLookup)
                }
                cancelClose={cancelClose}
                scheduleClose={scheduleClose}
              />
            ) : null}
            {previewChain.map((preview, index) => (
              <FloatingPreviewSurface
                key={preview.id}
                avoidElementIds={[
                  ...(pinnedPreview ? [PINNED_PREVIEW_ID] : []),
                  ...previewChain.slice(0, index).map((ancestor) => ancestor.id),
                ].join('|')}
                preview={preview}
                emphasized={index === previewChain.length - 1}
                hasChild={previewChain[index + 1]?.parentId === preview.id}
                safeTop={safeTop}
                onMove={moveTransient}
                onPin={pinTransient}
                onReferenceImmediate={openReference}
                onReferenceIntent={openReferenceWithIntent}
                onReferenceIntentCancel={cancelReferenceIntent}
                onReferenceLeave={scheduleDescendantsClose}
                onReferencePin={pinReference}
                cancelClose={cancelClose}
                scheduleClose={scheduleClose}
              />
            ))}
            {previewChain.map((preview) =>
              preview.parentId ? (
                <PreviewCorridor
                  key={`corridor:${preview.id}`}
                  fromId={preview.parentId}
                  toId={preview.id}
                  cancelClose={cancelClose}
                  scheduleClose={scheduleClose}
                />
              ) : null,
            )}
          </>,
          document.body,
        )

  return (
    <RulesPreviewContext.Provider value={context}>
      {children}
      {portal}
    </RulesPreviewContext.Provider>
  )
}

export function useRulesPreview(): RulesPreviewContextValue {
  return useContext(RulesPreviewContext)
}
