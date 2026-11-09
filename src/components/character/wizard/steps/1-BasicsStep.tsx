import { type ReactNode, useCallback, useId } from 'react'
import { IDENTITY_PLACEHOLDERS } from '@/components/character/identityPlaceholders'
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
import { cn } from '@/lib/utils'
import type { PortraitTransform } from '@/types/character'
import type { StepProps } from '../types'

const physicalFields = [
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes', label: 'Eyes' },
] as const

export function BasicsStep({
  data,
  onChange,
  intro,
  nameError,
}: StepProps & { intro?: ReactNode; nameError?: string | null }) {
  const characterNameId = useId()
  const physicalFieldId = useId()
  const ageId = useId()
  const genderId = useId()
  const hairId = useId()

  const handlePortraitChange = useCallback(
    (p: string | null) => {
      onChange({ portrait: p ?? '' })
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
      <div className="grid grid-cols-3 gap-2.5">
        <div className="col-span-full min-w-0 space-y-1.5">
          <Label htmlFor={characterNameId}>Character Name</Label>
          <Input
            id={characterNameId}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? `${characterNameId}-error` : undefined}
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={cn(
              nameError && 'border-destructive focus-visible:ring-destructive animate-shake',
            )}
          />
          {nameError && (
            <p id={`${characterNameId}-error`} className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>
        {physicalFields.map(({ key, label }) => (
          <div key={key} className="min-w-0 space-y-1.5">
            <Label htmlFor={`${physicalFieldId}-${key}`}>{label}</Label>
            <Input
              id={`${physicalFieldId}-${key}`}
              value={data[key]}
              onChange={(e) => onChange({ [key]: e.target.value })}
              placeholder={IDENTITY_PLACEHOLDERS[key]}
            />
          </div>
        ))}
        <div className="min-w-0 space-y-2">
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
            placeholder={IDENTITY_PLACEHOLDERS.age}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={genderId}>Gender</Label>
          <Select value={data.gender} onValueChange={(value) => onChange({ gender: value })}>
            <SelectTrigger id={genderId} className="w-full">
              <SelectValue placeholder={IDENTITY_PLACEHOLDERS.gender} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Non-binary">Non-binary</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={hairId}>Hair</Label>
          <Input
            id={hairId}
            value={data.hair}
            onChange={(e) => onChange({ hair: e.target.value })}
            placeholder={IDENTITY_PLACEHOLDERS.hair}
          />
        </div>
      </div>
    </div>
  )

  return (
    <PortraitPicker
      identity={identity}
      portrait={data.portrait}
      transform={data.portraitTransform}
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
