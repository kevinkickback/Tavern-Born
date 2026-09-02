import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function WorkspaceDetailContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="workspace-detail-content"
      className={cn('mx-auto w-full max-w-4xl p-5 text-sm leading-6', className)}
      {...props}
    />
  )
}
