import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function WorkspaceDetailContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-4xl p-5', className)} {...props} />
}
