import { Sidebar } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
  className,
  leftClassName,
  rightClassName,
}: SplitPaneProps) {
  return (
    <div
      data-slot="split-pane"
      className={cn('relative flex min-h-0 flex-1 flex-row overflow-hidden -my-6', className)}
    >
      {/* Toggle buttons — absolute top-right */}
      {showCollapseControls && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
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
        className={cn(
          'flex flex-col overflow-hidden bg-workspace-pane transition-all duration-300 ease-in-out',
          leftCollapsed
            ? 'w-0 min-w-0 opacity-0 pointer-events-none flex-none'
            : rightCollapsed || !leftWidth
              ? 'flex-1 min-w-0'
              : 'min-w-0 flex-none',
          leftClassName,
        )}
        style={!leftCollapsed && !rightCollapsed && leftWidth ? { width: leftWidth } : undefined}
      >
        {left}
      </div>

      {/* Right pane wrapper — collapses to 0 via CSS transition */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-l border-border bg-workspace-detail transition-all duration-300 ease-in-out',
          rightCollapsed
            ? 'w-0 min-w-0 opacity-0 pointer-events-none'
            : leftCollapsed || leftWidth
              ? 'flex-1 min-w-0'
              : rightFixedWidth
                ? 'min-w-0 flex-none'
                : rightWidth,
          rightClassName,
        )}
        style={
          !leftCollapsed && !rightCollapsed && !leftWidth && rightFixedWidth
            ? { width: rightFixedWidth }
            : undefined
        }
      >
        {right}
      </div>
    </div>
  )
}
