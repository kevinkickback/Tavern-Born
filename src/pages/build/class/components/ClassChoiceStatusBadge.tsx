import { Check } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function getClassChoiceStatus(pending: number) {
  if (pending === 0) return 'All choices made'
  return `${pending} pending ${pending === 1 ? 'choice' : 'choices'}`
}

export function ClassChoiceStatusBadge({
  pending,
  action,
}: {
  pending: number
  action?: 'Apply package' | 'Needs attention'
}) {
  const complete = pending === 0 && !action
  return (
    <Badge
      className={cn(
        'h-5 gap-1 px-1.5 text-xs pointer-events-none border',
        complete
          ? 'border-success/40 bg-success/15 text-success hover:bg-success/15'
          : 'border-warning/40 bg-warning/20 text-warning-foreground hover:bg-warning/20 dark:border-warning/30',
      )}
    >
      {complete && <Check className="h-3 w-3" weight="bold" />}
      {pending === 0 && action ? action : getClassChoiceStatus(pending)}
    </Badge>
  )
}
