import { type ReactNode, useCallback, useId } from 'react'
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
import { getRaceDisplayName } from '@/lib/calculations/raceDisplay'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'
import type { StepProps } from '../types'

export function BasicsStep({
  data,
  onChange,
  intro,
  invalidFields = new Set(),
}: StepProps & { intro?: ReactNode }) {
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

  const identity = (
    <div>
      {intro}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2 min-w-0 space-y-1.5">
          <Label htmlFor={characterNameId}>Character Name</Label>
          <Input
            id={characterNameId}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={cn(
              hasError('name') && 'border-destructive focus-visible:ring-destructive animate-shake',
            )}
          />
        </div>
        <div className="col-span-2 min-w-0 space-y-1.5">
          <Label htmlFor={playerNameId}>Player Name</Label>
          <Input
            id={playerNameId}
            value={data.playerName}
            onChange={(e) => onChange({ playerName: e.target.value })}
            placeholder="Enter player name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ageId}>Age</Label>
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
            placeholder="Years"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={genderId}>Gender</Label>
          <Select value={data.gender} onValueChange={(value) => onChange({ gender: value })}>
            <SelectTrigger id={genderId} className="w-full">
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
    </div>
  )

  return (
    <PortraitPicker
      identity={identity}
      portrait={data.portrait}
      transform={data.portraitTransform ?? DEFAULT_PORTRAIT_TRANSFORM}
      name={data.name}
      level={1}
      race={getRaceDisplayName(data.race, data.subrace) || 'Race'}
      characterClass={data.class || 'Class'}
      gender={data.gender}
      onPortraitChange={handlePortraitChange}
      onTransformChange={handleTransformChange}
    />
  )
}
