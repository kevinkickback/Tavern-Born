import { ArrowLeft, Sidebar } from '@phosphor-icons/react'
import { type CSSProperties, type ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

export type CompactPane = 'left' | 'right'

interface SplitPaneProps {
  /** Inner content of the left pane. */
  left: ReactNode
  /** Inner content of the right pane (outer sizing div already stripped). */
  right: ReactNode
  /** Optional fixed width of the left/master pane when both panes are visible. */
  leftWidth?: string
  /** Tailwind width classes for the right pane when no left width is supplied. */
  rightWidth?: string
  /** Optional fixed CSS width for a right-side inspector, mirroring leftWidth. */
  rightFixedWidth?: string
  leftCollapsed: boolean
  rightCollapsed: boolean
  onLeftCollapsedChange: (collapsed: boolean) => void
  onRightCollapsedChange: (collapsed: boolean) => void
  /** Whether pane collapse controls are shown. Defaults to true. */
  showCollapseControls?: boolean
  /** Active pane below the shared compact breakpoint. Uncontrolled when omitted. */
  compactPane?: CompactPane
  /** Initial compact pane for uncontrolled usage. */
  defaultCompactPane?: CompactPane
  /** Called when the compact pane switcher changes panes. */
  onCompactPaneChange?: (pane: CompactPane) => void
  compactLeftLabel?: string
  compactRightLabel?: string
  className?: string
  leftClassName?: string
  rightClassName?: string
}

/**
 * Split-pane layout used by build pages and the compendium.
 *
 * Manages two panes — a standard-width left/master pane and a flexible right/detail pane —
 * with animated collapse transitions and two toggle buttons in the top-right corner.
 *
 * Callers own the collapsed state; this component is fully controlled.
 */
export function SplitPane({
  left,
  right,
  leftWidth,
  rightWidth = 'w-1/2 min-w-[320px]',
  rightFixedWidth,
  leftCollapsed,
  rightCollapsed,
  onLeftCollapsedChange,
  onRightCollapsedChange,
  showCollapseControls = true,
  compactPane,
  defaultCompactPane = 'left',
  onCompactPaneChange,
  compactLeftLabel = 'List',
  compactRightLabel = 'Details',
  className,
  leftClassName,
  rightClassName,
}: SplitPaneProps) {
  const [internalCompactPane, setInternalCompactPane] = useState<CompactPane>(defaultCompactPane)
  const activeCompactPane = compactPane ?? internalCompactPane
  const setActiveCompactPane = (pane: CompactPane) => {
    if (compactPane === undefined) setInternalCompactPane(pane)
    onCompactPaneChange?.(pane)
  }

  const paneWidths = {
    ...(leftWidth ? { '--split-pane-left-width': leftWidth } : {}),
    ...(rightFixedWidth ? { '--split-pane-right-width': rightFixedWidth } : {}),
  } as CSSProperties

  return (
    <div
      data-slot="split-pane"
      className={cn(
        '@container relative flex min-h-0 flex-1 flex-col overflow-hidden -my-6',
        className,
        'gap-0',
      )}
    >
      <div
        className="flex h-10 shrink-0 items-center border-b border-border bg-surface-raised/45 p-1 @min-[840px]:hidden"
        role="tablist"
        aria-label="Workspace pane"
      >
        {(
          [
            { value: 'left', label: compactLeftLabel },
            { value: 'right', label: compactRightLabel },
          ] as const
        ).map(({ value, label }) => {
          const active = activeCompactPane === value
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveCompactPane(value)}
              className={cn(
                'flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold transition-colors',
                active
                  ? 'bg-surface-selected text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {value === 'left' && activeCompactPane === 'right' && (
                <ArrowLeft className="mr-1.5 size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden @min-[840px]:flex-row',
          !leftCollapsed && !rightCollapsed && '@min-[840px]:gap-3',
        )}
        style={paneWidths}
      >
        {/* Toggle buttons — absolute top-right */}
        {showCollapseControls && (
          <div className="absolute top-2 right-2 z-10 hidden gap-1 @min-[840px]:flex">
            {/* Left-pane toggle */}
            <button
              type="button"
              onClick={() => onLeftCollapsedChange(!leftCollapsed)}
              disabled={rightCollapsed}
              title={leftCollapsed ? 'Expand list panel' : 'Collapse list panel'}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface-raised text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sidebar className="h-3.5 w-3.5" weight={leftCollapsed ? 'regular' : 'fill'} />
            </button>
            {/* Right-pane toggle */}
            <button
              type="button"
              onClick={() => onRightCollapsedChange(!rightCollapsed)}
              disabled={leftCollapsed}
              title={rightCollapsed ? 'Expand details panel' : 'Collapse details panel'}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface-raised text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sidebar
                className="h-3.5 w-3.5"
                weight={rightCollapsed ? 'regular' : 'fill'}
                style={{ transform: 'scaleX(-1)' }}
              />
            </button>
          </div>
        )}

        {/* Left pane wrapper — collapses to 0 via CSS transition */}
        <div
          data-slot="split-pane-left"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-workspace-pane transition-all duration-300 ease-in-out @min-[840px]:flex',
            activeCompactPane === 'left' ? 'flex' : 'hidden',
            leftCollapsed
              ? '@min-[840px]:w-0 @min-[840px]:min-w-0 @min-[840px]:flex-none @min-[840px]:pointer-events-none @min-[840px]:opacity-0'
              : rightCollapsed || !leftWidth
                ? '@min-[840px]:min-w-0 @min-[840px]:flex-1'
                : '@min-[840px]:w-[var(--split-pane-left-width)] @min-[840px]:min-w-0 @min-[840px]:flex-none',
            leftClassName,
          )}
        >
          {left}
        </div>

        {/* Right pane wrapper — collapses to 0 via CSS transition */}
        <div
          data-slot="split-pane-right"
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-workspace-detail transition-all duration-300 ease-in-out @min-[840px]:flex @min-[840px]:border-l @min-[840px]:border-border',
            activeCompactPane === 'right' ? 'flex' : 'hidden',
            rightCollapsed
              ? '@min-[840px]:w-0 @min-[840px]:min-w-0 @min-[840px]:pointer-events-none @min-[840px]:opacity-0'
              : leftCollapsed || leftWidth
                ? '@min-[840px]:min-w-0 @min-[840px]:flex-1'
                : rightFixedWidth
                  ? '@min-[840px]:w-[var(--split-pane-right-width)] @min-[840px]:min-w-0 @min-[840px]:flex-none'
                  : rightWidth,
            rightClassName,
          )}
        >
          {right}
        </div>
      </div>
    </div>
  )
}
