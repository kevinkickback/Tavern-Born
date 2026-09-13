import { useEffect, useLayoutEffect, useRef } from 'react'
import { PreviewNavigationControls } from '@/components/editor/PreviewNavigationControls'
import { useDraggablePreview } from '@/hooks/ui/useDraggablePreview'
import { getTitleBarSafeTop, type PreviewBounds, type PreviewPosition } from '@/lib/overlayPosition'
import { getRecursiveHintPosition, type RecursiveHintState } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

interface RecursiveTooltipChainProps {
  hints: RecursiveHintState[]
  index?: number
  historyTitles: string[]
  pinnedDepth: number | null
  pinnedPosition: PreviewPosition | null
  mode?: 'chain' | 'pinned'
  onNavigate: (depth: number) => void
  onPinToggle: (depth: number, bounds?: PreviewBounds) => void
  onPinnedPositionChange: (position: PreviewPosition) => void
}

export function RecursiveTooltipChain({
  hints,
  index = 0,
  historyTitles,
  pinnedDepth,
  pinnedPosition,
  mode = 'chain',
  onNavigate,
  onPinToggle,
  onPinnedPositionChange,
}: RecursiveTooltipChainProps) {
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const safeTop = getTitleBarSafeTop(uiScale)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const hint = hints[index]
  const triggerElement = hint?.triggerElement
  const depth = index + 1
  const isPinned = pinnedDepth === depth
  const { dragHandleProps, dragging } = useDraggablePreview({
    enabled: mode === 'pinned' && isPinned,
    label: hint?.title ?? 'pinned',
    position: pinnedPosition,
    previewRef: tooltipRef,
    safeTop,
    onPositionChange: onPinnedPositionChange,
  })

  useEffect(() => {
    if (!triggerElement) return
    triggerElement.setAttribute('data-recursive-preview-active', 'true')
    triggerElement.setAttribute('aria-expanded', 'true')
    return () => {
      triggerElement.removeAttribute('data-recursive-preview-active')
      triggerElement.setAttribute('aria-expanded', 'false')
    }
  }, [triggerElement])

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip || !triggerElement || !hint || mode === 'pinned') return

    const updatePosition = () => {
      const { x, y } = getRecursiveHintPosition(triggerElement, !!hint.html, safeTop, {
        width: tooltip.offsetWidth || 320,
        height: tooltip.offsetHeight || (hint.html ? 220 : 88),
      })
      tooltip.style.left = `${x}px`
      tooltip.style.top = `${y}px`
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
  }, [hint, mode, safeTop, triggerElement])

  if (!hint) return null
  const isNewest = index === hints.length - 1

  return (
    <div
      ref={tooltipRef}
      role="dialog"
      aria-label={`${hint.title} preview`}
      data-recursive-tooltip-depth={index + 1}
      className={cn(
        'w-[320px] max-w-[calc(100vw-1rem)] rounded border bg-card text-card-foreground transition-[box-shadow,border-color] duration-100',
        mode === 'pinned' ? 'fixed z-[9999]' : 'absolute',
        isNewest || isPinned
          ? 'border-accent/70 ring-1 ring-accent/45 shadow-xl'
          : 'border-border/80 shadow-md',
      )}
      style={
        mode === 'pinned' && pinnedPosition
          ? pinnedPosition
          : { left: hint.x, top: hint.y, zIndex: 100 + index }
      }
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div
            {...(mode === 'pinned' ? dragHandleProps : {})}
            className={cn(
              'min-w-0 flex-1',
              mode === 'pinned' && 'app-no-drag cursor-grab touch-none select-none',
              dragging && 'cursor-grabbing',
            )}
          >
            {mode === 'pinned' ? (
              <div className="font-semibold text-base leading-tight">{hint.title}</div>
            ) : (
              <button
                type="button"
                className="text-left font-semibold text-base leading-tight hover:text-accent-foreground"
                onClick={() => onNavigate(depth)}
                title={`Return to ${hint.title}`}
              >
                {hint.title}
              </button>
            )}
          </div>
          <PreviewNavigationControls
            currentDepth={depth}
            historyTitles={historyTitles}
            pinned={isPinned}
            onNavigate={onNavigate}
            onPinToggle={onPinToggle}
          />
        </div>
        {hint.subtitle ? (
          <div className="mt-0.5 text-sm text-muted-foreground">{hint.subtitle}</div>
        ) : null}
      </div>
      <div className="max-h-[220px] overflow-y-auto px-3 pb-3 pt-2 text-sm leading-relaxed">
        {hint.html ? (
          <div
            // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
            dangerouslySetInnerHTML={{ __html: hint.html }}
            className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">No description available.</p>
        )}
      </div>

      {mode === 'chain' ? (
        <RecursiveTooltipChain
          hints={hints}
          index={index + 1}
          historyTitles={historyTitles}
          pinnedDepth={pinnedDepth}
          pinnedPosition={pinnedPosition}
          onNavigate={onNavigate}
          onPinToggle={onPinToggle}
          onPinnedPositionChange={onPinnedPositionChange}
        />
      ) : null}
    </div>
  )
}
