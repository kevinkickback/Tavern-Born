import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PreviewNavigationControls } from '@/components/editor/PreviewNavigationControls'
import { RecursiveTooltipChain } from '@/components/editor/RecursiveTooltipChain'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type PreviewDragHandleProps, useDraggablePreview } from '@/hooks/ui/useDraggablePreview'
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
  clampPreviewPosition,
  getTitleBarSafeTop,
  type PreviewBounds,
  type PreviewPosition,
} from '@/lib/overlayPosition'
import {
  getEntryWithHoverTitles,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  parseRecursiveReference,
  type RecursiveHintState,
  type RecursiveLookup,
} from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'
import type { Spell5e } from '@/types/5etools'

interface SpellNameTooltipProps {
  name: string
  spell?: Spell5e
  recursiveLookup: RecursiveLookup
  sourceContext?: string
}

const HIDE_DELAY_MS = 200

interface SpellPreviewContentsProps {
  spell?: Spell5e
  renderedEntries: { html: string; key: string }[]
  sourceContext?: string
  navigation: ReactNode
  onTitleClick: () => void
  dragHandleProps?: PreviewDragHandleProps
  dragging?: boolean
  children?: ReactNode
}

function SpellPreviewContents({
  spell,
  renderedEntries,
  sourceContext,
  navigation,
  onTitleClick,
  dragHandleProps,
  dragging = false,
  children,
}: SpellPreviewContentsProps) {
  if (!spell) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Details unavailable.</div>
  }

  return (
    <>
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div
            {...dragHandleProps}
            className={cn(
              'min-w-0 flex-1',
              dragHandleProps && 'app-no-drag cursor-grab touch-none select-none',
              dragging && 'cursor-grabbing',
            )}
          >
            {dragHandleProps ? (
              <div className="font-semibold text-xl leading-tight">{spell.name}</div>
            ) : (
              <button
                type="button"
                className="text-left font-semibold text-xl leading-tight hover:text-accent-foreground"
                onClick={onTitleClick}
                title={`Return to ${spell.name}`}
              >
                {spell.name}
              </button>
            )}
            <div className="mt-0.5 text-sm text-muted-foreground">
              {formatSpellLevel(spell.level)} {getSchoolName(spell.school)}
            </div>
          </div>
          {navigation}
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
            // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
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
      {children}
    </>
  )
}

interface PinnedPreviewState {
  depth: number
  position: PreviewPosition
}

export function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: SpellNameTooltipProps) {
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const safeTop = getTitleBarSafeTop(uiScale)
  const [open, setOpen] = useState(false)
  const [pinnedPreview, setPinnedPreview] = useState<PinnedPreviewState | null>(null)
  const pinnedDepth = pinnedPreview?.depth ?? null
  const [recursiveHints, setRecursiveHints] = useState<RecursiveHintState[]>([])
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinnedTooltipRef = useRef<HTMLDivElement | null>(null)
  const displayName = formatSpellDisplayName(name, spell?.name)

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    if (pinnedDepth !== null) return
    clearHide()
    hideTimer.current = setTimeout(() => {
      setOpen(false)
      setRecursiveHints([])
    }, HIDE_DELAY_MS)
  }, [clearHide, pinnedDepth])

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
    const scopedReference = parseRecursiveReference(
      text,
      fallbackName,
      hoverType,
      hoverName,
      hoverSource,
      withTitle.getAttribute('data-hover-class-name') ?? undefined,
      withTitle.getAttribute('data-hover-class-source') ?? undefined,
      withTitle.getAttribute('data-hover-subclass-name') ?? undefined,
      withTitle.getAttribute('data-hover-subclass-source') ?? undefined,
    )
    const resolved = getRecursiveTooltipData(
      scopedReference,
      recursiveLookup,
      text,
      formatSpellLevel,
      getSchoolName,
    )
    const { x, y } = getRecursiveHintPosition(withTitle, !!resolved.html, safeTop)

    setRecursiveHints((current) => [
      ...current.slice(0, depth),
      {
        ...resolved,
        x,
        y,
        triggerElement: withTitle,
      },
    ])
    if (pinnedDepth !== null) {
      setPinnedPreview((current) => (current ? { ...current, depth: depth + 1 } : current))
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (pinnedDepth !== null) return
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

  const handleNavigate = (depth: number) => {
    if (depth < 0) return
    if (pinnedDepth !== null) {
      setPinnedPreview((current) => (current ? { ...current, depth } : current))
      return
    }
    setRecursiveHints((current) => current.slice(0, depth))
  }

  const handlePinToggle = (depth: number, bounds?: PreviewBounds) => {
    if (pinnedDepth === depth) {
      setPinnedPreview(null)
      setOpen(true)
      return
    }
    if (!bounds) return
    clearHide()
    setOpen(false)
    setPinnedPreview({
      depth,
      position: clampPreviewPosition(
        { left: bounds.left, top: bounds.top },
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight },
        safeTop,
      ),
    })
  }

  const handlePinnedPositionChange = useCallback((position: PreviewPosition) => {
    setPinnedPreview((current) => (current ? { ...current, position } : current))
  }, [])

  const handleCloseAll = () => {
    clearHide()
    setPinnedPreview(null)
    setOpen(false)
    setRecursiveHints([])
  }

  const handlePreviewKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    const activeDepth = pinnedDepth ?? recursiveHints.length
    if (activeDepth > 0) handleNavigate(activeDepth - 1)
    else handleCloseAll()
  }

  const historyTitles = [spell?.name ?? displayName, ...recursiveHints.map((hint) => hint.title)]
  const rootPinned = pinnedDepth === 0
  const { dragHandleProps: rootDragHandleProps, dragging: rootDragging } = useDraggablePreview({
    enabled: rootPinned,
    label: spell?.name ?? displayName,
    position: pinnedPreview?.position ?? null,
    previewRef: pinnedTooltipRef,
    safeTop,
    onPositionChange: handlePinnedPositionChange,
  })

  return (
    <>
      <Tooltip open={pinnedDepth === null && open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span
            data-recursive-preview-active={pinnedDepth !== null || open ? 'true' : undefined}
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
          onKeyDown={handlePreviewKeyDown}
          className={cn(
            'w-[320px] max-w-[calc(100vw-2rem)] p-0 !bg-card !text-card-foreground border transition-[box-shadow,border-color] duration-100',
            recursiveHints.length === 0
              ? 'border-accent/70 ring-1 ring-accent/45 shadow-xl'
              : 'border-border/80 shadow-md',
          )}
        >
          <SpellPreviewContents
            spell={spell}
            renderedEntries={renderedEntries}
            sourceContext={sourceContext}
            onTitleClick={() => handleNavigate(0)}
            navigation={
              <PreviewNavigationControls
                currentDepth={0}
                historyTitles={historyTitles}
                pinned={rootPinned}
                onNavigate={handleNavigate}
                onPinToggle={handlePinToggle}
              />
            }
          >
            <RecursiveTooltipChain
              hints={recursiveHints}
              historyTitles={historyTitles}
              pinnedDepth={pinnedDepth}
              pinnedPosition={pinnedPreview?.position ?? null}
              onNavigate={handleNavigate}
              onPinToggle={handlePinToggle}
              onPinnedPositionChange={handlePinnedPositionChange}
            />
          </SpellPreviewContents>
        </TooltipContent>
      </Tooltip>
      {pinnedPreview
        ? createPortal(
            pinnedPreview.depth === 0 ? (
              <div
                ref={pinnedTooltipRef}
                role="dialog"
                aria-label={`${spell?.name ?? displayName} preview`}
                data-recursive-tooltip-depth={0}
                onMouseMove={handleRecursiveHover}
                onMouseEnter={clearHide}
                onMouseLeave={scheduleHide}
                onKeyDown={handlePreviewKeyDown}
                className="fixed z-[9999] w-[320px] max-w-[calc(100vw-1rem)] rounded border border-accent/70 bg-card text-card-foreground ring-1 ring-accent/45 shadow-xl"
                style={pinnedPreview.position}
              >
                <SpellPreviewContents
                  spell={spell}
                  renderedEntries={renderedEntries}
                  sourceContext={sourceContext}
                  onTitleClick={() => handleNavigate(0)}
                  dragHandleProps={rootDragHandleProps}
                  dragging={rootDragging}
                  navigation={
                    <PreviewNavigationControls
                      currentDepth={0}
                      historyTitles={historyTitles}
                      pinned
                      onNavigate={handleNavigate}
                      onPinToggle={handlePinToggle}
                    />
                  }
                />
              </div>
            ) : (
              // biome-ignore lint/a11y/noStaticElementInteractions: delegates interactions to the portaled preview and its generated inline references.
              <div
                onMouseMove={handleRecursiveHover}
                onMouseEnter={clearHide}
                onMouseLeave={scheduleHide}
                onKeyDown={handlePreviewKeyDown}
              >
                <RecursiveTooltipChain
                  hints={recursiveHints}
                  index={pinnedPreview.depth - 1}
                  historyTitles={historyTitles}
                  pinnedDepth={pinnedDepth}
                  pinnedPosition={pinnedPreview.position}
                  mode="pinned"
                  onNavigate={handleNavigate}
                  onPinToggle={handlePinToggle}
                  onPinnedPositionChange={handlePinnedPositionChange}
                />
              </div>
            ),
            document.body,
          )
        : null}
    </>
  )
}
