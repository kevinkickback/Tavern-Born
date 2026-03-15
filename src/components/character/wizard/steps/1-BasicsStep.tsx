import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { User } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { StepProps } from '../types'

export function BasicsStep({ data, onChange, invalidFields = new Set() }: StepProps) {
  const placeholderPortraits = Array.from({ length: 12 }, (_, i) => 
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`
  )

  const hasError = (field: string) => invalidFields.has(field)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Label htmlFor="character-name" className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Character Name
          </Label>
          <Input
            id="character-name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Enter character name"
            className={cn(
              "text-lg",
              hasError('name') && "border-destructive focus-visible:ring-destructive animate-shake"
            )}
          />
        </div>
        <div>
          <Label htmlFor="gender" className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4" />
            Gender
          </Label>
          <Select value={data.gender} onValueChange={(value) => onChange({ gender: value })}>
            <SelectTrigger id="gender">
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

      <div>
        <Label className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4" />
          Portrait
        </Label>
        <div className="grid grid-cols-6 gap-3">
          {placeholderPortraits.map((url, index) => (
            <button
              key={index}
              onClick={() => onChange({ portrait: url })}
              className={cn(
                'relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                data.portrait === url
                  ? 'border-accent ring-2 ring-accent/50'
                  : 'border-border hover:border-accent/50'
              )}
            >
              <img
                src={url}
                alt={`Portrait ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
