import { Plus, Shield, Trash } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { calculateArmorClassAdjustmentTotal } from '@/lib/calculations/armorClass'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { ArmorClassAdjustment } from '@/types/character'

interface ArmorClassModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DIRECT_ARMOR_CLASS_ADJUSTMENT_ID = 'manual-direct-armor-class'
type ArmorClassAdjustmentDraft = Omit<ArmorClassAdjustment, 'amount'> & { amount: string }

function parseInteger(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}

export function ArmorClassModal({ open, onOpenChange }: ArmorClassModalProps) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const { calculatedAC, effectiveAC, saveArmorClassSettings } = useArmorClass()
  const [adjustments, setAdjustments] = useState<ArmorClassAdjustmentDraft[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newNote, setNewNote] = useState('')
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideValue, setOverrideValue] = useState('')
  const [directArmorClass, setDirectArmorClass] = useState('')
  const newLabelId = useId()
  const newAmountId = useId()
  const newNoteId = useId()
  const overrideId = useId()
  const directArmorClassId = useId()

  useEffect(() => {
    if (!open || !character) return
    setAdjustments(
      (character.armorClassAdjustments ?? []).map((adjustment) => ({
        ...adjustment,
        amount: String(adjustment.amount),
      })),
    )
    setNewLabel('')
    setNewAmount('')
    setNewNote('')
    setOverrideEnabled(character.armorClassOverride != null)
    setOverrideValue(
      character.armorClassOverride != null ? String(character.armorClassOverride) : '',
    )
    setDirectArmorClass(String(effectiveAC))
  }, [open, character, effectiveAC])

  if (!character) return null

  const resolvedAdjustments: ArmorClassAdjustment[] = adjustments.map((adjustment) => ({
    ...adjustment,
    amount: parseInteger(adjustment.amount),
  }))
  const adjustmentTotal = calculateArmorClassAdjustmentTotal(resolvedAdjustments)
  const adjustedAC = Math.max(0, calculatedAC + adjustmentTotal)
  const parsedOverride = parseInteger(overrideValue)
  const validOverride = !overrideEnabled || parsedOverride >= 0
  const previewAC = overrideEnabled && validOverride ? parsedOverride : adjustedAC

  const addAdjustment = () => {
    const label = newLabel.trim()
    if (!label) {
      toast.error('Describe where this Armor Class change came from.')
      return
    }
    if (
      !newAmount.trim() ||
      Number.isNaN(Number(newAmount)) ||
      !Number.isInteger(Number(newAmount))
    ) {
      toast.error('Enter a whole number, such as 1 or -2.')
      return
    }

    setAdjustments((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label,
        amount: String(Number(newAmount)),
        sourceType: 'manual',
        sourceRef: newNote.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
    ])
    setNewLabel('')
    setNewAmount('')
    setNewNote('')
  }

  const applyDirectArmorClass = () => {
    const desired = parseInteger(directArmorClass, -1)
    if (desired < 0) {
      toast.error('Armor Class cannot be negative.')
      return
    }
    const otherAdjustments = adjustments.filter(
      (adjustment) => adjustment.id !== DIRECT_ARMOR_CLASS_ADJUSTMENT_ID,
    )
    const otherTotal = calculateArmorClassAdjustmentTotal(
      resolvedAdjustments.filter(
        (adjustment) => adjustment.id !== DIRECT_ARMOR_CLASS_ADJUSTMENT_ID,
      ),
    )
    const amount = desired - calculatedAC - otherTotal
    const directAdjustment: ArmorClassAdjustmentDraft = {
      id: DIRECT_ARMOR_CLASS_ADJUSTMENT_ID,
      label: 'Custom Armor Class',
      amount: String(amount),
      sourceType: 'manual',
      createdAt:
        adjustments.find((adjustment) => adjustment.id === DIRECT_ARMOR_CLASS_ADJUSTMENT_ID)
          ?.createdAt ?? new Date().toISOString(),
    }
    setAdjustments(amount === 0 ? otherAdjustments : [...otherAdjustments, directAdjustment])
    setOverrideEnabled(false)
    setOverrideValue('')
  }

  const handleSave = () => {
    if (!validOverride) {
      toast.error('Fixed Armor Class cannot be negative.')
      return
    }
    saveArmorClassSettings({
      adjustments: resolvedAdjustments,
      override: overrideEnabled ? parsedOverride : undefined,
    })
    onOpenChange(false)
    toast.success('Armor Class updated.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-workspace-detail sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-primary" weight="fill" />
            Manage Armor Class
          </DialogTitle>
          <DialogDescription>
            Add lasting bonuses or penalties without losing equipment and Dexterity calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-workspace-pane p-4 text-center">
            <p className="text-sm text-muted-foreground">Armor Class</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-primary">{previewAC}</p>
            {overrideEnabled ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Using a fixed Armor Class; lasting changes are saved but do not change this number.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {calculatedAC} from equipment and Dexterity
                {adjustmentTotal !== 0 && ` ${formatSigned(adjustmentTotal)} from lasting changes`}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Add a lasting AC change</h3>
              <p className="text-xs text-muted-foreground">
                Use a positive number for a bonus or a negative number for a penalty.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={newLabelId}>What caused it?</Label>
                <Input
                  id={newLabelId}
                  placeholder="Ring of protection"
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={newAmountId}>AC change</Label>
                <Input
                  id={newAmountId}
                  type="number"
                  placeholder="+1"
                  value={newAmount}
                  onChange={(event) => setNewAmount(event.target.value)}
                />
              </div>
              <Button type="button" onClick={addAdjustment}>
                <Plus />
                Add
              </Button>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer hover:text-foreground">Add a note</summary>
              <div className="mt-2 rounded-md border border-border p-3">
                <Label htmlFor={newNoteId}>Note (optional)</Label>
                <Input
                  id={newNoteId}
                  className="mt-1.5"
                  placeholder="Gift from the party's patron"
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                />
              </div>
            </details>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Lasting changes</h3>
            {adjustments.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                None yet.
              </p>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-workspace-pane">
                {adjustments.map((adjustment) => {
                  const amount = parseInteger(adjustment.amount)
                  return (
                    <div key={adjustment.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{adjustment.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {adjustment.sourceRef || 'Always applies'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          amount < 0 ? 'text-destructive' : 'text-primary',
                        )}
                      >
                        {formatSigned(amount)} AC
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
              More AC options
            </summary>
            <div className="space-y-5 border-t border-border p-3">
              <section className="space-y-2">
                <div>
                  <h4 className="text-sm font-medium">Set Armor Class directly</h4>
                  <p className="text-xs text-muted-foreground">
                    Equipment and Dexterity changes will still update your Armor Class.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={directArmorClassId}
                    aria-label="Set Armor Class directly"
                    type="number"
                    min={0}
                    value={directArmorClass}
                    onChange={(event) => setDirectArmorClass(event.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={applyDirectArmorClass}>
                    Set Armor Class
                  </Button>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor={overrideId}>Keep Armor Class fixed</Label>
                    <p className="text-xs text-muted-foreground">
                      A fixed Armor Class ignores equipment and Dexterity changes.
                    </p>
                  </div>
                  <Switch
                    id={overrideId}
                    checked={overrideEnabled}
                    onCheckedChange={setOverrideEnabled}
                  />
                </div>
                {overrideEnabled && (
                  <Input
                    type="number"
                    min={0}
                    aria-label="Fixed Armor Class"
                    value={overrideValue}
                    aria-invalid={!validOverride}
                    onChange={(event) => setOverrideValue(event.target.value)}
                  />
                )}
              </section>
            </div>
          </details>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
