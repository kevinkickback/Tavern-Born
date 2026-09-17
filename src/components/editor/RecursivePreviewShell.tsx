import { forwardRef } from 'react'
import type { PreviewPosition } from '@/lib/overlayPosition'
import { cn } from '@/lib/utils'

interface RecursivePreviewShellProps extends React.HTMLAttributes<HTMLDivElement> {
  depth?: number
  emphasized?: boolean
  label: string
  pinned?: boolean
  position?: PreviewPosition
}

export const RecursivePreviewShell = forwardRef<HTMLDivElement, RecursivePreviewShellProps>(
  function RecursivePreviewShell(
    {
      children,
      className,
      depth = 0,
      emphasized = true,
      label,
      pinned = false,
      position,
      ...props
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={`${label} preview`}
        data-recursive-tooltip-depth={depth}
        data-preview-pinned={pinned ? 'true' : undefined}
        className={cn(
          'w-[320px] max-w-[calc(100vw-1rem)] rounded border bg-card text-card-foreground transition-[box-shadow,border-color] duration-100',
          'fixed z-[9999]',
          emphasized
            ? 'border-accent/70 ring-1 ring-accent/45 shadow-xl'
            : 'border-border/80 shadow-md',
          className,
        )}
        style={position}
        {...props}
      >
        {children}
      </div>
    )
  },
)
