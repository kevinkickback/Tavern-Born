import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface WorkspacePaneHeaderProps {
  title?: string
  ariaLabel?: string
  count?: ReactNode
  children?: ReactNode
  className?: string
}

export function WorkspacePaneHeader({
  title,
  ariaLabel,
  count,
  children,
  className,
}: WorkspacePaneHeaderProps) {
  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/20 px-4',
        className,
      )}
    >
      {title ? (
        <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </h2>
      ) : ariaLabel ? (
        <h2 className="sr-only">{ariaLabel}</h2>
      ) : null}
      {count !== undefined && (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
      )}
      {children}
    </header>
  )
}
