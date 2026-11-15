import { cn } from '@/lib/utils'

export function getSidebarRowClassName(active: boolean) {
  return cn(
    'relative flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
    active
      ? 'bg-secondary font-medium text-primary'
      : 'text-[color:var(--navigation-foreground)] hover:bg-secondary/70 hover:text-foreground',
  )
}
