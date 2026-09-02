import { IdentificationCard } from '@phosphor-icons/react'
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
    <div className="flex min-h-full flex-col gap-5">
      <section className="overflow-hidden rounded-lg border border-border bg-workspace-pane">
        <div className="flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-3">
          <IdentificationCard className="size-4 text-primary" weight="duotone" />
          <div>
            <h3 className="text-sm font-semibold">Character identity</h3>
            <p className="text-xs text-muted-foreground">
              Add the details used on your character sheet.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor={characterNameId}>Character Name</Label>
            <Input
              id={characterNameId}
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Enter character name"
              className={cn(
                hasError('name') &&
                  'border-destructive focus-visible:ring-destructive animate-shake',
              )}
            />
          </div>
          <div className="space-y-2">
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
              placeholder="Enter age"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={genderId}>Gender</Label>
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
      </section>

      <section className="min-h-[28rem] flex-1">
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
          density="compact"
          collapsible={false}
        />
      </section>
    </div>
  )
}
