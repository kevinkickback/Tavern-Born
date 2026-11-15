import type { ReactNode } from 'react'

interface SidebarSectionHeadingProps {
  as?: 'h2' | 'p'
  id?: string
  children: ReactNode
}

export function SidebarSectionHeading({
  as: Heading = 'h2',
  id,
  children,
}: SidebarSectionHeadingProps) {
  return (
    <div className="mb-1 flex items-center gap-2 px-2">
      <Heading
        id={id}
        className="shrink-0 text-[length:var(--font-size-caption)] font-semibold uppercase leading-[var(--line-height-caption)] tracking-[0.1em] text-muted-foreground/80"
      >
        {children}
      </Heading>
      <span aria-hidden="true" className="h-px min-w-0 flex-1 bg-border" />
    </div>
  )
}
