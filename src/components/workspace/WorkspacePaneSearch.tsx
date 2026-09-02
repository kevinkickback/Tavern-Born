import { MagnifyingGlass } from '@phosphor-icons/react'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface WorkspacePaneSearchProps extends Omit<ComponentProps<'input'>, 'type'> {
  containerClassName?: string
}

export function WorkspacePaneSearch({
  className,
  containerClassName,
  ...props
}: WorkspacePaneSearchProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center border-b border-border bg-surface-raised p-2',
        containerClassName,
      )}
    >
      <div className="relative w-full">
        <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          className={cn(
            'h-[var(--control-height-sm)] border-border-strong bg-workspace-pane pl-8 text-sm shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
            className,
          )}
          {...props}
        />
      </div>
    </div>
  )
}
