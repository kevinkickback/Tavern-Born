import { ArrowCounterClockwise, Check, LockSimple, Plus } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export type ProficiencyRowState = 'chosen' | 'granted' | 'available' | 'unavailable'

const choiceSelectedClass = 'bg-primary/10 text-foreground hover:bg-primary/15'
const fixedSelectedClass = 'bg-success/10 text-foreground hover:bg-success/15'

export function proficiencyRowClass(state: ProficiencyRowState, hasPendingChoices: boolean) {
  if (state === 'chosen') return choiceSelectedClass
  if (state === 'granted') return fixedSelectedClass
  if (state === 'unavailable' && hasPendingChoices) return 'bg-muted/30 text-muted-foreground'
  return 'bg-surface-raised text-foreground hover:bg-surface-hover'
}

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
  actionable = false,
}: {
  state: ProficiencyRowState
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
  return <span className="size-3.5 shrink-0" aria-hidden="true" />
}
