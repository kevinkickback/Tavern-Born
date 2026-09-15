import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface CharacteristicsFieldProps {
  id: string
  label: string
  children: ReactNode
}

export function CharacteristicsField({ id, label, children }: CharacteristicsFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}
