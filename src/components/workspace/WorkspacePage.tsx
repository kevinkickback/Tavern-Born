import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function WorkspacePage({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="workspace-page"
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-workspace-canvas text-sm leading-5',
        className,
      )}
      {...props}
    />
  )
}

export function WorkspaceToolbar({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      data-slot="workspace-toolbar"
      className={cn(
        'flex h-[var(--workspace-pane-header-height)] shrink-0 items-center gap-2 border-b border-border bg-surface-raised px-3',
        className,
      )}
      {...props}
    />
  )
}

export function WorkspaceBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="workspace-body"
      className={cn('min-h-0 flex-1 overflow-auto', className)}
      {...props}
    />
  )
}
