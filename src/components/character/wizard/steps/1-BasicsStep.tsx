import { User } from '@phosphor-icons/react'
import { useCallback, useId } from 'react'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'
import type { StepProps } from '../types'

export function BasicsStep({ data, onChange, invalidFields = new Set() }: StepProps) {
  const characterNameId = useId()
  const playerNameId = useId()
  const ageId = useId()
  const genderId = useId()

  const hasError = (field: string) => invalidFields.has(field)

  const handlePortraitChange = useCallback(
    (p: string | null) => {
      onChange({
        portrait: p || '',
        portraitTransform: DEFAULT_PORTRAIT_TRANSFORM,
      })
    },
    [onChange],
  )

  const handleTransformChange = useCallback(
    (t: PortraitTransform) => {
      onChange({ portraitTransform: t })
    },
    [onChange],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 shrink-0">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={characterNameId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Character Name
          </Label>
          <Input
            id={characterNameId}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={cn(
              'text-lg',
              hasError('name') && 'border-destructive focus-visible:ring-destructive animate-shake',
            )}
          />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={playerNameId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Player Name
          </Label>
          <Input
            id={playerNameId}
            value={data.playerName}
            onChange={(e) => onChange({ playerName: e.target.value })}
            placeholder="Enter player name"
          />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={ageId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Age
          </Label>
          <Input
            id={ageId}
            type="number"
            min={0}
            step={1}
            value={data.age ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                onChange({ age: null })
                return
              }
              const parsed = Number.parseInt(raw, 10)
              if (Number.isNaN(parsed)) {
                return
              }
              onChange({ age: Math.max(0, parsed) })
            }}
            placeholder="Enter age"
          />
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor={genderId} className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Gender
          </Label>
          <Select value={data.gender} onValueChange={(value) => onChange({ gender: value })}>
            <SelectTrigger id={genderId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Non-binary">Non-binary</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col rounded-lg border border-border bg-muted/20 p-4">
        <PortraitPicker
          portrait={data.portrait}
          transform={data.portraitTransform ?? DEFAULT_PORTRAIT_TRANSFORM}
          name={data.name}
          level={1}
          race="Race"
          characterClass="Class"
          gender={data.gender}
          onPortraitChange={handlePortraitChange}
          onTransformChange={handleTransformChange}
        />
      </div>
    </div>
  )
}
