import { forwardRef } from 'react'
import type { PreviewPosition } from '@/lib/overlayPosition'
import { cn } from '@/lib/utils'

interface RulesPreviewShellProps extends React.HTMLAttributes<HTMLDivElement> {
  emphasized?: boolean
  label: string
  layer: 'pinned' | 'primary' | 'transient'
  position: PreviewPosition
}

export const RulesPreviewShell = forwardRef<HTMLDivElement, RulesPreviewShellProps>(
  function RulesPreviewShell(
    { children, className, emphasized = true, label, layer, onWheel, position, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={`${label} preview`}
        data-rules-preview-layer={layer}
        data-preview-pinned={layer === 'pinned' ? 'true' : undefined}
        onWheel={(event) => {
          onWheel?.(event)
          event.stopPropagation()
        }}
        className={cn(
          'pointer-events-auto fixed w-[320px] max-w-[calc(100vw-1rem)] animate-in rounded border bg-card text-card-foreground fade-in-0 transition-[box-shadow,border-color] duration-100 [animation-duration:100ms]',
          layer === 'transient' ? 'z-[10000]' : 'z-[9999]',
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
