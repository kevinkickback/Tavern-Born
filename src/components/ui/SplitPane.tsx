import { Sidebar } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SplitPaneProps {
    /** Inner content of the left pane. */
    left: ReactNode
    /** Inner content of the right pane (outer sizing div already stripped). */
    right: ReactNode
    /**
     * Tailwind width classes for the right pane when both panes are visible.
     * @default 'w-1/2 min-w-[320px]'
     */
    rightWidth?: string
    leftCollapsed: boolean
    rightCollapsed: boolean
    onLeftCollapsedChange: (collapsed: boolean) => void
    onRightCollapsedChange: (collapsed: boolean) => void
}

/**
 * Split-pane layout used by build pages and the compendium.
 *
 * Manages two panes — a flexible left pane and a fixed-width right pane —
 * with animated collapse transitions and two toggle buttons in the top-right corner.
 *
 * Callers own the collapsed state; this component is fully controlled.
 */
export function SplitPane({
    left,
    right,
    rightWidth = 'w-1/2 min-w-[320px]',
    leftCollapsed,
    rightCollapsed,
    onLeftCollapsedChange,
    onRightCollapsedChange,
}: SplitPaneProps) {
    return (
        <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
            {/* Toggle buttons — absolute top-right */}
            <div className="absolute top-2 right-2 z-10 flex gap-1">
                {/* Left-pane toggle */}
                <button
                    type="button"
                    onClick={() => onLeftCollapsedChange(!leftCollapsed)}
                    disabled={rightCollapsed}
                    title={leftCollapsed ? 'Expand list panel' : 'Collapse list panel'}
                    className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                    <Sidebar className="h-3.5 w-3.5" weight={leftCollapsed ? 'regular' : 'fill'} />
                </button>
                {/* Right-pane toggle */}
                <button
                    type="button"
                    onClick={() => onRightCollapsedChange(!rightCollapsed)}
                    disabled={leftCollapsed}
                    title={rightCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                    className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                    <Sidebar
                        className="h-3.5 w-3.5"
                        weight={rightCollapsed ? 'regular' : 'fill'}
                        style={{ transform: 'scaleX(-1)' }}
                    />
                </button>
            </div>

            {/* Left pane wrapper — collapses to 0 via CSS transition */}
            <div
                className={cn(
                    'flex flex-col overflow-hidden transition-all duration-300 ease-in-out',
                    leftCollapsed ? 'w-0 min-w-0 opacity-0 pointer-events-none flex-none' : 'flex-1 min-w-0',
                )}
            >
                {left}
            </div>

            {/* Right pane wrapper — collapses to 0 via CSS transition */}
            <div
                className={cn(
                    'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                    rightCollapsed
                        ? 'w-0 min-w-0 opacity-0 pointer-events-none'
                        : leftCollapsed
                            ? 'flex-1 min-w-0'
                            : rightWidth,
                )}
            >
                {right}
            </div>
        </div>
    )
}
