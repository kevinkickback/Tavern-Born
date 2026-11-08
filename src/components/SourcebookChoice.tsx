import { BookOpen, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'

interface SourcebookChoiceProps {
  source: SourceBook
  selected: boolean
  compatibility: { compatible: boolean; reason?: string }
  onClick: () => void
  className?: string
  wrapName?: boolean
  showSelection?: boolean
}

export function SourcebookChoice({
  source,
  selected,
  compatibility,
  onClick,
  className,
  wrapName = false,
  showSelection = false,
}: SourcebookChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      disabled={!compatibility.compatible}
      title={compatibility.reason}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm',
        showSelection && 'bg-workspace-canvas',
        className,
        !compatibility.compatible &&
          'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
        selected
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
      )}
    >
      {showSelection ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border border-border-strong',
            selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {selected && <Check className="size-3" weight="bold" />}
        </span>
      ) : (
        <BookOpen
          className={cn(
            'mt-0.5 size-4 shrink-0',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      )}
      <div className={cn('min-w-0', wrapName && 'flex-1')}>
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
    </button>
  )
}
