import { cn } from '@/lib/utils'

/** Labeled detail card with icon header and text content. */
export function DetailSection({
  icon: Icon,
  label,
  children,
  empty,
}: {
  icon: React.ComponentType<{ className?: string; weight?: string }>
  label: string
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn('text-sm', empty && 'text-muted-foreground')}>{children}</p>
    </div>
  )
}

/** Labeled detail card with icon header and raw HTML content. */
export function DetailHtmlSection({
  icon: Icon,
  label,
  html,
}: {
  icon: React.ComponentType<{ className?: string; weight?: string }>
  label: string
  html: string | null
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {html ? (
        <span
          className="text-sm [&_a]:text-accent [&_a]:no-underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">None</p>
      )}
    </div>
  )
}
