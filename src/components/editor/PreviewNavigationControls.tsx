import { PushPin } from '@phosphor-icons/react'
import type { PreviewBounds } from '@/lib/overlayPosition'
import { cn } from '@/lib/utils'

interface PreviewNavigationControlsProps {
  currentDepth: number
  historyTitles: string[]
  pinned: boolean
  onNavigate: (depth: number) => void
  onPinToggle: (depth: number, bounds?: PreviewBounds) => void
}

export function PreviewNavigationControls({
  currentDepth,
  historyTitles,
  pinned,
  onNavigate,
  onPinToggle,
}: PreviewNavigationControlsProps) {
  const controlClass =
    'flex size-7 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-40'
  const showHistory = historyTitles.length > 1 && (currentDepth > 0 || pinned)

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showHistory ? (
        <select
          aria-label="Preview history"
          title="Preview history"
          value={currentDepth}
          onChange={(event) => onNavigate(Number(event.target.value))}
          className="h-7 w-[4.75rem] rounded border border-border bg-card px-1 text-[10px] text-muted-foreground outline-none focus:border-ring"
        >
          {historyTitles.map((title, depth) => (
            <option key={`${historyTitles.slice(0, depth).join('|')}|${title}`} value={depth}>
              {depth + 1}/{historyTitles.length} {title}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          const preview = event.currentTarget.closest<HTMLElement>('[data-recursive-tooltip-depth]')
          const rect = preview?.getBoundingClientRect()
          onPinToggle(
            currentDepth,
            rect
              ? {
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }
              : undefined,
          )
        }}
        className={cn(controlClass, pinned && 'border-accent/60 text-accent-foreground')}
        title={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
        aria-label={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
      >
        <PushPin className="size-3.5" weight={pinned ? 'fill' : 'regular'} />
      </button>
    </div>
  )
}
