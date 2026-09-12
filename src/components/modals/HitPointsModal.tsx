import { Heart, Plus, Trash } from '@phosphor-icons/react'
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
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { calculateHitPointAdjustmentTotal, getTotalCharacterLevel } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { HitPointAdjustment } from '@/types/character'

interface HitPointsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DESIRED_MAXIMUM_ADJUSTMENT_ID = 'manual-desired-maximum'
type HitPointAdjustmentDraft = Omit<HitPointAdjustment, 'amount'> & { amount: string }

function parseInteger(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}

export function HitPointsModal({ open, onOpenChange }: HitPointsModalProps) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const { hitPoints, calculatedMaxHP, effectiveMaxHP, saveHitPointSettings } = useHitPoints()
  const [current, setCurrent] = useState('0')
  const [temporary, setTemporary] = useState('0')
  const [adjustments, setAdjustments] = useState<HitPointAdjustmentDraft[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newSource, setNewSource] = useState('')
  const [newMode, setNewMode] = useState<HitPointAdjustment['mode']>('flat')
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideValue, setOverrideValue] = useState('')
  const [desiredMaximum, setDesiredMaximum] = useState('')
  const [currentEdited, setCurrentEdited] = useState(false)
  const overrideId = useId()
  const currentHpId = useId()
  const temporaryHpId = useId()
  const desiredMaximumId = useId()
  const newLabelId = useId()
  const newAmountId = useId()
  const newModeId = useId()

  useEffect(() => {
    if (!open || !character) return
    const initialCurrent =
      character.hitPointsInitialized === true || hitPoints.current !== 0
        ? hitPoints.current
        : effectiveMaxHP
    setCurrent(String(initialCurrent))
    setCurrentEdited(false)
    setTemporary(String(hitPoints.temporary))
    setAdjustments(
      (character.hitPointAdjustments ?? []).map((adjustment) => ({
        ...adjustment,
        amount: String(adjustment.amount),
      })),
    )
    setNewLabel('')
    setNewAmount('')
    setNewSource('')
    setNewMode('flat')
    const existingOverride =
      character.maxHitPointsOverride ??
      (character.hitPoints.max > 0 ? character.hitPoints.max : undefined)
    setOverrideEnabled(existingOverride != null)
    setOverrideValue(existingOverride != null ? String(existingOverride) : '')
    setDesiredMaximum(String(effectiveMaxHP))
  }, [
    open,
    character,
    character?.hitPointsInitialized,
    hitPoints.current,
    hitPoints.temporary,
    effectiveMaxHP,
  ])

  if (!character) return null

  const characterLevel = getTotalCharacterLevel(character)
  const resolvedAdjustments: HitPointAdjustment[] = adjustments.map((adjustment) => ({
    ...adjustment,
    amount: parseInteger(adjustment.amount),
  }))
  const adjustmentTotal = calculateHitPointAdjustmentTotal(resolvedAdjustments, characterLevel)
  const adjustedMaxHP = Math.max(1, calculatedMaxHP + adjustmentTotal)
  const parsedOverride = parseInteger(overrideValue)
  const validOverride = !overrideEnabled || parsedOverride >= 1
  const previewEffectiveMaxHP = overrideEnabled && validOverride ? parsedOverride : adjustedMaxHP
  const maximumChange = previewEffectiveMaxHP - effectiveMaxHP
  const displayedCurrent = currentEdited
    ? current
    : String(Math.max(0, parseInteger(current) + maximumChange))

  const addAdjustment = () => {
    const label = newLabel.trim()
    if (!label) {
      toast.error('Describe where this HP change came from.')
      return
    }
    if (
      !newAmount.trim() ||
      Number.isNaN(Number(newAmount)) ||
      !Number.isInteger(Number(newAmount))
    ) {
      toast.error('Enter a whole number, such as 5 or -3.')
      return
    }
    setAdjustments((currentAdjustments) => [
      ...currentAdjustments,
      {
        id: crypto.randomUUID(),
        label,
        amount: String(Number(newAmount)),
        mode: newMode,
        sourceType: 'manual',
        sourceRef: newSource.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
    ])
    setNewLabel('')
    setNewAmount('')
    setNewSource('')
    setNewMode('flat')
  }

  const applyDesiredMaximum = () => {
    const desired = parseInteger(desiredMaximum)
    if (desired < 1) {
      toast.error('Maximum HP must be at least 1.')
      return
    }
    const otherAdjustments = adjustments.filter(
      (adjustment) => adjustment.id !== DESIRED_MAXIMUM_ADJUSTMENT_ID,
    )
    const otherTotal = calculateHitPointAdjustmentTotal(
      resolvedAdjustments.filter((adjustment) => adjustment.id !== DESIRED_MAXIMUM_ADJUSTMENT_ID),
      characterLevel,
    )
    const amount = desired - calculatedMaxHP - otherTotal
    const desiredAdjustment: HitPointAdjustmentDraft = {
      id: DESIRED_MAXIMUM_ADJUSTMENT_ID,
      label: 'Custom maximum',
      amount: String(amount),
      mode: 'flat',
      sourceType: 'manual',
      createdAt:
        adjustments.find((adjustment) => adjustment.id === DESIRED_MAXIMUM_ADJUSTMENT_ID)
          ?.createdAt ?? new Date().toISOString(),
    }
    setAdjustments(amount === 0 ? otherAdjustments : [...otherAdjustments, desiredAdjustment])
    setOverrideEnabled(false)
    setOverrideValue('')
  }

  const handleSave = () => {
    if (!validOverride) {
      toast.error('Fixed maximum HP must be at least 1.')
      return
    }
    const currentValue = Math.max(0, parseInteger(displayedCurrent))
    saveHitPointSettings({
      current: currentValue,
      temporary: Math.max(0, parseInteger(temporary)),
      adjustments: resolvedAdjustments,
      maxOverride: overrideEnabled ? parsedOverride : undefined,
    })
    onOpenChange(false)
    toast.success('Hit points updated.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-workspace-detail sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="size-5 text-red-500" weight="fill" />
            Manage Hit Points
          </DialogTitle>
          <DialogDescription>
            Track your health and add lasting bonuses or penalties to your maximum HP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-lg border border-border bg-workspace-pane">
            <div className="grid sm:grid-cols-3">
              <div className="space-y-2 p-4 text-center">
                <Label htmlFor={currentHpId} className="text-sm text-muted-foreground">
                  Current HP
                </Label>
                <Input
                  id={currentHpId}
                  type="number"
                  min={0}
                  value={displayedCurrent}
                  onChange={(event) => {
                    setCurrent(event.target.value)
                    setCurrentEdited(true)
                  }}
                  className="h-12 text-center text-2xl font-semibold tabular-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCurrent(String(previewEffectiveMaxHP))
                    setCurrentEdited(true)
                  }}
                >
                  Restore to full
                </Button>
              </div>

              <div className="flex flex-col justify-center border-y border-border p-4 text-center sm:border-x sm:border-y-0">
                <p className="text-sm text-muted-foreground">Maximum HP</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums text-red-500">
                  {previewEffectiveMaxHP}
                </p>
              </div>

              <div className="space-y-2 p-4 text-center">
                <Label htmlFor={temporaryHpId} className="text-sm text-muted-foreground">
                  Temporary HP
                </Label>
                <Input
                  id={temporaryHpId}
                  type="number"
                  min={0}
                  value={temporary}
                  onChange={(event) => setTemporary(event.target.value)}
                  className="h-12 text-center text-2xl font-semibold tabular-nums"
                />
                <p className="h-7 text-xs leading-7 text-muted-foreground">Extra protection</p>
              </div>
            </div>

            <div className="border-t border-border px-4 py-2 text-center">
              {overrideEnabled ? (
                <p className="text-xs text-muted-foreground">
                  Using a fixed maximum; lasting changes are saved but do not change this number.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {calculatedMaxHP} from class, level, and Constitution
                  {adjustmentTotal !== 0 &&
                    ` ${formatSigned(adjustmentTotal)} from lasting changes`}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Add a lasting HP change</h3>
              <p className="text-xs text-muted-foreground">
                Use a positive number for a bonus or a negative number for a penalty.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={newLabelId}>What caused it?</Label>
                <Input
                  id={newLabelId}
                  placeholder="Divine blessing"
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={newAmountId}>HP change</Label>
                <Input
                  id={newAmountId}
                  type="number"
                  placeholder="+5"
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
              <summary className="w-fit cursor-pointer hover:text-foreground">
                More options for this change
              </summary>
              <div className="mt-2 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={newModeId}>How often does it apply?</Label>
                  <select
                    id={newModeId}
                    value={newMode}
                    onChange={(event) =>
                      setNewMode(event.target.value as HitPointAdjustment['mode'])
                    }
                    className="h-[var(--control-height-md)] w-full rounded-md border border-border-strong bg-surface-raised/55 px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="flat">Once</option>
                    <option value="per-level">At every character level</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${newModeId}-note`}>Note (optional)</Label>
                  <Input
                    id={`${newModeId}-note`}
                    placeholder="Gift from Amaunator"
                    value={newSource}
                    onChange={(event) => setNewSource(event.target.value)}
                  />
                </div>
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
                  const total = adjustment.mode === 'per-level' ? amount * characterLevel : amount
                  return (
                    <div key={adjustment.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{adjustment.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {adjustment.mode === 'per-level'
                            ? `${formatSigned(amount)} at each level (${formatSigned(total)} now)`
                            : adjustment.sourceRef || 'Applies once'}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          total < 0 ? 'text-destructive' : 'text-primary',
                        )}
                      >
                        {formatSigned(total)} HP
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${adjustment.label}`}
                        onClick={() =>
                          setAdjustments((currentAdjustments) =>
                            currentAdjustments.filter((entry) => entry.id !== adjustment.id),
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
              More HP options
            </summary>
            <div className="space-y-5 border-t border-border p-3">
              <section className="space-y-2">
                <div>
                  <h4 className="text-sm font-medium">Set the maximum directly</h4>
                  <p className="text-xs text-muted-foreground">
                    Your maximum will still increase normally when you gain levels.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={desiredMaximumId}
                    aria-label="Set maximum HP directly"
                    type="number"
                    min={1}
                    value={desiredMaximum}
                    onChange={(event) => setDesiredMaximum(event.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={applyDesiredMaximum}>
                    Set Maximum
                  </Button>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor={overrideId}>Keep maximum HP fixed</Label>
                    <p className="text-xs text-muted-foreground">
                      A fixed maximum will not increase when you level up.
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
                    min={1}
                    aria-label="Fixed maximum HP"
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
