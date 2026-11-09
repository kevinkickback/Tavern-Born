import { BookOpen, Check, LockSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'

interface SourcebookChoiceProps {
  source: SourceBook
  selected: boolean
  required?: boolean
  compatibility: { compatible: boolean; reason?: string }
  onClick: () => void
  className?: string
  variant?: 'default' | 'wizard'
}

export function SourcebookChoice({
  source,
  selected,
  required = false,
  compatibility,
  onClick,
  className,
  variant = 'default',
}: SourcebookChoiceProps) {
  const isWizard = variant === 'wizard'

  return (
    <button
      type="button"
      aria-pressed={selected || required}
      onClick={onClick}
      disabled={required || !compatibility.compatible}
      title={required ? undefined : compatibility.reason}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2.5 text-left text-sm',
        isWizard && 'bg-workspace-pane',
        className,
        !required &&
          !compatibility.compatible &&
          'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
        required
          ? 'cursor-not-allowed border-border bg-muted/20 text-muted-foreground'
          : selected
            ? cn('border-accent text-foreground', isWizard ? 'bg-surface-selected' : 'bg-accent/10')
            : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
      )}
    >
      {isWizard ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border border-border-strong',
            required
              ? 'border-border bg-muted text-muted-foreground'
              : selected && 'border-primary bg-primary text-primary-foreground',
          )}
        >
          {required ? (
            <LockSimple className="size-3" weight="bold" />
          ) : (
            selected && <Check className="size-3" weight="bold" />
          )}
        </span>
      ) : (
        <BookOpen
          className={cn(
            'mt-0.5 size-4 shrink-0',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      )}
      <div className={cn('min-w-0', isWizard && 'flex-1')}>
        <div className={cn('font-semibold', isWizard ? 'break-words' : 'truncate')}>
          {source.name}
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          {source.abbreviation}
          {source.year && ` (${source.year})`}
        </div>
        {required && (
          <div className="mt-0.5 text-xs font-medium text-muted-foreground">Required</div>
        )}
        {!required && !compatibility.compatible && (
          <div className="mt-0.5 text-[11px] text-warning">{compatibility.reason}</div>
        )}
      </div>
    </button>
  )
}
