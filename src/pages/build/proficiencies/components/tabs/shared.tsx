import { ArrowCounterClockwise, Check, LockSimple, Plus } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ProficiencyRowState = 'chosen' | 'granted' | 'available' | 'unavailable'

export const choiceSelectedClass = 'bg-primary/10 text-foreground hover:bg-primary/15'
export const fixedSelectedClass = 'bg-success/10 text-foreground hover:bg-success/15'

export function formatProfLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /(^|[\s/-])([a-z])/g,
      (_, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`,
    )
}

export function ProficiencyStatus({ state }: { state: ProficiencyRowState }) {
  const label =
    state === 'chosen'
      ? 'Chosen'
      : state === 'granted'
        ? 'Granted'
        : state === 'available'
          ? 'Available'
          : 'Unavailable'
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-semibold',
        state === 'chosen' && 'border-primary/50 bg-primary/10 text-primary',
        state === 'granted' && 'border-success/40 bg-success/10 text-success',
        state === 'available' && 'border-primary/50 bg-primary/10 text-primary',
        state === 'unavailable' && 'border-border bg-muted/20 text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

export function ProficiencyStateIcon({
  state,
  fallback,
  actionable = false,
}: {
  state: ProficiencyRowState
  fallback: ReactNode
  actionable?: boolean
}) {
  if (state === 'chosen') {
    return (
      <span className="relative size-3.5 shrink-0" aria-hidden="true">
        <Check className="size-3.5 group-hover:hidden group-focus-visible:hidden" />
        <ArrowCounterClockwise className="hidden size-3.5 group-hover:block group-focus-visible:block" />
      </span>
    )
  }
  if (state === 'granted') return <LockSimple className="size-3.5 shrink-0" aria-hidden="true" />
  if (state === 'available' && actionable) {
    return <Plus className="size-3.5 shrink-0" aria-hidden="true" />
  }
  return fallback
}
