import { Lightning, Plus, Trash } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMovement } from '@/hooks/character/useMovement'
import { formatEffectiveMovement } from '@/lib/calculations/movement'
import { capitalizeLabel } from '@/lib/displayLabels'
import { cn } from '@/lib/utils'
import type { MovementAdjustment, MovementMode } from '@/types/character'

interface MovementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactNode
}

const MOVEMENT_MODES: readonly MovementMode[] = ['walk', 'climb', 'swim', 'fly', 'burrow']
type MovementAdjustmentDraft = Omit<MovementAdjustment, 'amount'> & { amount: string }

function parseInteger(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

export function MovementModal({ open, onOpenChange, trigger }: MovementModalProps) {
  const {
    adjustments: persistedAdjustments,
    baseMovement,
    baseMovementSourceLabel,
    effectiveMovement,
    overrides: persistedOverrides,
    previewMovementSettings,
    saveMovementSettings,
  } = useMovement()
  const [adjustments, setAdjustments] = useState<MovementAdjustmentDraft[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [newLabel, setNewLabel] = useState('')
  const [newMode, setNewMode] = useState('walk')
  const [newAmount, setNewAmount] = useState('')
  const labelId = useId()
  const modeId = useId()
  const amountId = useId()
  const overrideIdPrefix = useId()

  useEffect(() => {
    if (!open) return
    setAdjustments(
      persistedAdjustments.map((adjustment) => ({
        ...adjustment,
        amount: String(adjustment.amount),
      })),
    )
    setOverrides(
      Object.fromEntries(
        Object.entries(persistedOverrides).map(([mode, value]) => [mode, String(value)]),
      ),
    )
    setNewLabel('')
    setNewMode('walk')
    setNewAmount('')
  }, [open, persistedAdjustments, persistedOverrides])

  const resolvedAdjustments = useMemo(
    () =>
      adjustments.map((adjustment) => ({
        ...adjustment,
        amount: parseInteger(adjustment.amount) ?? 0,
      })),
    [adjustments],
  )
  const resolvedOverrides = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(overrides).flatMap(([mode, rawValue]) => {
          const value = parseInteger(rawValue)
          return value !== undefined && value >= 0 ? [[mode, value]] : []
        }),
      ),
    [overrides],
  )
  const preview = useMemo(
    () =>
      open
        ? previewMovementSettings({
            adjustments: resolvedAdjustments,
            overrides: resolvedOverrides,
          })
        : effectiveMovement,
    [open, previewMovementSettings, resolvedAdjustments, resolvedOverrides, effectiveMovement],
  )

  const addAdjustment = () => {
    const label = newLabel.trim()
    const amount = parseInteger(newAmount)
    if (!label) {
      toast.error('Describe what caused the movement change.')
      return
    }
    if (amount === undefined) {
      toast.error('Enter a whole number, such as 10 or -5.')
      return
    }
    setAdjustments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label,
        mode: newMode,
        amount: String(amount),
        sourceType: 'manual',
        createdAt: new Date().toISOString(),
      },
    ])
    setNewLabel('')
    setNewAmount('')
  }

  const handleSave = () => {
    const invalidOverride = Object.values(overrides).some((value) => {
      const parsed = parseInteger(value)
      return value.trim().length > 0 && (parsed === undefined || parsed < 0)
    })
    if (invalidOverride) {
      toast.error('Fixed movement speeds must be whole numbers of zero or more.')
      return
    }
    saveMovementSettings({
      adjustments: resolvedAdjustments,
      overrides: resolvedOverrides,
    })
    onOpenChange(false)
    toast.success('Movement updated.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-workspace-detail sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightning className="size-5 text-primary" weight="fill" />
            Manage Movement
          </DialogTitle>
          <DialogDescription>
            Review your character’s movement, add speed bonuses or penalties, and set exact speeds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-workspace-pane p-4 text-center">
            <p className="text-sm text-muted-foreground">Effective movement</p>
            <p className="mt-1 text-lg font-semibold text-primary">
              {formatEffectiveMovement(preview)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Base source: {baseMovementSourceLabel}
              {baseMovement.source.source ? ` (${baseMovement.source.source})` : ''}
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Add a manual movement change</h3>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem_auto] sm:items-end">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={labelId}>What caused it?</Label>
                <Input
                  id={labelId}
                  placeholder="Longstrider"
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={modeId}>Mode</Label>
                <Select value={newMode} onValueChange={setNewMode}>
                  <SelectTrigger
                    id={modeId}
                    className="w-full border-border-strong bg-surface-raised/55 data-[size=default]:h-[var(--control-height-md)]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {capitalizeLabel(mode)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={amountId}>Feet</Label>
                <Input
                  id={amountId}
                  type="number"
                  placeholder="+10"
                  value={newAmount}
                  onChange={(event) => setNewAmount(event.target.value)}
                />
              </div>
              <Button type="button" onClick={addAdjustment}>
                <Plus />
                Add
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Manual changes</h3>
            {adjustments.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                None yet.
              </p>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-workspace-pane">
                {adjustments.map((adjustment) => {
                  const amount = parseInteger(adjustment.amount) ?? 0
                  return (
                    <div key={adjustment.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{adjustment.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {capitalizeLabel(adjustment.mode)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          amount < 0 ? 'text-destructive' : 'text-primary',
                        )}
                      >
                        {amount >= 0 ? '+' : ''}
                        {amount} ft.
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${adjustment.label}`}
                        onClick={() =>
                          setAdjustments((current) =>
                            current.filter((entry) => entry.id !== adjustment.id),
                          )
                        }
                      >
                        <Trash className="text-destructive" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <details className="rounded-md border border-border bg-workspace-pane">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
              Exact movement overrides
            </summary>
            <div className="space-y-4 border-t border-border p-3">
              <p className="text-xs text-muted-foreground">
                Fixed values replace the calculated value for that mode. Leave a field blank to keep
                it derived.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {MOVEMENT_MODES.map((mode) => {
                  const overrideId = `${overrideIdPrefix}-${mode}`
                  return (
                    <div key={mode} className="space-y-1.5">
                      <Label htmlFor={overrideId}>{capitalizeLabel(mode)}</Label>
                      <Input
                        id={overrideId}
                        type="number"
                        min={0}
                        placeholder="Derived"
                        value={overrides[mode] ?? ''}
                        onChange={(event) =>
                          setOverrides((current) => ({
                            ...current,
                            [mode]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
