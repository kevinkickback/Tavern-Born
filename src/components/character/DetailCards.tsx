import { GameContent } from '@/components/editor/GameContent'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'

export function DetailSection({
  label,
  children,
  empty,
}: {
  label: string
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</h3>
      <p className={cn('text-sm', empty && 'text-muted-foreground')}>{children}</p>
    </div>
  )
}

export function DetailHtmlSection({
  label,
  html,
  recursiveLookup,
}: {
  label: string
  html: string | null
  recursiveLookup?: RecursiveLookup
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</h3>
      {html ? (
        <GameContent
          entry={html}
          recursiveLookup={recursiveLookup}
          className="text-sm [&_a]:text-primary [&_a]:no-underline"
        />
      ) : (
        <p className="text-sm text-muted-foreground">None</p>
      )}
    </div>
  )
}
