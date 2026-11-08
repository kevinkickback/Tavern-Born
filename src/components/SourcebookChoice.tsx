import { BookOpen } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'

interface SourcebookChoiceProps {
  source: SourceBook
  selected: boolean
  compatibility: { compatible: boolean; reason?: string }
  onClick: () => void
  className?: string
  wrapName?: boolean
  row?: boolean
}

export function SourcebookChoice({
  source,
  selected,
  compatibility,
  onClick,
  className,
  wrapName = false,
  row = false,
}: SourcebookChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={!compatibility.compatible}
      title={compatibility.reason}
      className={cn(
        'flex gap-2 text-left text-sm',
        row ? 'w-full items-center px-2 py-2' : 'items-start rounded-md border px-3 py-2.5',
        className,
        !compatibility.compatible &&
          'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
        selected
          ? row
            ? 'bg-primary/5 text-foreground'
            : 'border-accent bg-accent/10 text-foreground'
          : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
        row && 'hover:bg-surface-hover',
      )}
    >
      <BookOpen
        className={cn(
          'h-4 w-4 shrink-0 mt-0.5',
          selected ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <div className={cn('min-w-0', (wrapName || row) && 'flex-1')}>
        <div className={cn('font-semibold', wrapName ? 'break-words' : 'truncate')}>
          {source.name}
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          {source.abbreviation}
          {source.year && ` (${source.year})`}
        </div>
        {!compatibility.compatible && (
          <div className="mt-0.5 text-[11px] text-warning">{compatibility.reason}</div>
        )}
      </div>
      {row && compatibility.compatible && (
        <span
          aria-hidden="true"
          className={cn('shrink-0 text-xs', selected && 'font-semibold text-primary')}
        >
          {selected ? '✓ Selected' : 'Available'}
        </span>
      )}
    </button>
  )
}
