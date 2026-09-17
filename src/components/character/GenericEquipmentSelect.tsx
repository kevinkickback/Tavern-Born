import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GenericEquipmentChoice } from '@/lib/5etools/startingEquipment'
import { cn } from '@/lib/utils'

export interface GenericEquipmentSelectProps {
  choice: GenericEquipmentChoice
  value: string
  onChange: (itemRef: string) => void
  ariaLabel?: string
  triggerClassName?: string
}

export function GenericEquipmentSelect({
  choice,
  value,
  onChange,
  ariaLabel = 'Choose a specific item',
  triggerClassName,
}: GenericEquipmentSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('mt-2 h-8 w-full text-xs', triggerClassName)}
      >
        <SelectValue placeholder="Choose a specific item…" />
      </SelectTrigger>
      <SelectContent>
        {choice.candidates.map((candidate) => {
          const itemRef = `${candidate.name}|${candidate.source ?? ''}`
          return (
            <SelectItem key={itemRef} value={itemRef}>
              {candidate.name} {candidate.source ? `(${candidate.source})` : ''}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
