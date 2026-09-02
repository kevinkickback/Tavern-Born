import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function Section({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="workspace-section"
      className={cn('border-b border-border-subtle py-4 last:border-b-0', className)}
      {...props}
    >
      {(title || description || actions) && (
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[length:var(--font-size-body)] font-semibold leading-[var(--line-height-body)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-[length:var(--font-size-label)] leading-[var(--line-height-label)] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
