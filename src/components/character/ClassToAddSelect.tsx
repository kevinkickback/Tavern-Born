import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ClassToAddSelect({
  value,
  onValueChange,
  options,
}: {
  value: string
  onValueChange: (value: string) => void
  options: {
    value: string
    name: string
    source: string
    disabled: boolean
    note?: string
  }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label="Class to add"
        className="h-9 w-full min-w-0 flex-1 bg-workspace-detail shadow-none"
      >
        <SelectValue placeholder="Choose a class..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            <span>{option.name}</span>
            <span className="ml-1 text-xs text-muted-foreground">
              ({option.source || 'Unknown source'})
            </span>
            {option.note && (
              <span className="ml-1 text-xs text-muted-foreground">({option.note})</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
