import { BookOpen } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'

export function CreatorEntityDetails({
  entity,
  subtitle,
  placeholder,
  children,
}: {
  entity?: { name: string; source: string; page?: number }
  subtitle?: string
  placeholder: ReactNode
  children: ReactNode
}) {
  return (
    <div className="@container flex min-w-0 flex-col border-t border-border pt-4 md:min-h-0 md:overflow-hidden md:border-t-0 md:border-l md:pt-0 md:pl-6">
      {entity ? (
        <>
          <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
            <h3 className="break-words text-2xl font-semibold tracking-tight">
              {entity.name}
              {subtitle && <span className="ml-1.5 text-primary">({subtitle})</span>}
            </h3>
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-workspace-pane px-2.5 py-1 text-xs text-muted-foreground">
              <BookOpen className="size-3.5" aria-hidden="true" />
              <span className="font-mono">{entity.source}</span>
              {entity.page && <span>p.{entity.page}</span>}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 py-3 md:overflow-y-auto md:pr-2">{children}</div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
          {placeholder}
        </div>
      )}
    </div>
  )
}

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
    <div className="min-w-0 bg-workspace-pane px-3 py-2.5">
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
    <div className="grid gap-1 border-b border-border py-2 @sm:grid-cols-[minmax(8rem,1fr)_2fr]">
      <h3 className="text-sm font-semibold">{label}</h3>
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
