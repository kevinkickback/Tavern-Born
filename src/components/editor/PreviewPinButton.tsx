import { PushPin } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface PreviewPinButtonProps {
  pinned: boolean
  onPinToggle: () => void
}

export function PreviewPinButton({ pinned, onPinToggle }: PreviewPinButtonProps) {
  return (
    <button
      type="button"
      onClick={onPinToggle}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-40',
        pinned && 'border-accent/60 text-accent-foreground',
      )}
      title={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
      aria-label={pinned ? 'Unpin tooltip' : 'Pin tooltip'}
    >
      <PushPin className="size-3.5" weight={pinned ? 'fill' : 'regular'} />
    </button>
  )
}
