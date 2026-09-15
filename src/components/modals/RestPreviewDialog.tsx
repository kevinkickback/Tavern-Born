import { MoonStars } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useRestPreview } from '@/hooks/character/useRestPreview'
import type { RestType } from '@/lib/character/commands/restCommands'

interface RestPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function parseRecovery(value: string, maximum: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(maximum, parsed))
}

export function RestPreviewDialog({ open, onOpenChange }: RestPreviewDialogProps) {
  const [restType, setRestType] = useState<RestType>('short')
  const [restoreHitPoints, setRestoreHitPoints] = useState(false)
  const [hitDiceRecoveredText, setHitDiceRecoveredText] = useState('0')
  const { hitDiceUsed, preview, commit } = useRestPreview()
  const shortRestId = useId()
  const longRestId = useId()
  const restoreHitPointsId = useId()
  const hitDiceRecoveredId = useId()

  useEffect(() => {
    if (!open) return
    setRestType('short')
    setRestoreHitPoints(false)
    setHitDiceRecoveredText('0')
  }, [open])

  const hitDiceRecovered = parseRecovery(hitDiceRecoveredText, hitDiceUsed)
  const result = useMemo(
    () =>
      preview({
        restType,
        restoreHitPoints: restType === 'long' && restoreHitPoints,
        hitDiceRecovered: restType === 'long' ? hitDiceRecovered : 0,
      }),
    [hitDiceRecovered, preview, restType, restoreHitPoints],
  )

  const handleApply = () => {
    if (!result || result.changes.length === 0) return
    commit(result)
    onOpenChange(false)
    toast.success(`${restType === 'short' ? 'Short' : 'Long'} rest changes applied to the draft.`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-workspace-detail sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoonStars className="size-5 text-primary" weight="fill" />
            Preview Rest
          </DialogTitle>
          <DialogDescription>
            Review every recovery change before applying one atomic update to the current draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <RadioGroup
            value={restType}
            onValueChange={(value) => setRestType(value as RestType)}
            className="grid grid-cols-2 gap-3"
            aria-label="Rest type"
          >
            <Label
              htmlFor={shortRestId}
              className="cursor-pointer rounded-lg border border-border bg-workspace-pane p-3"
            >
              <RadioGroupItem id={shortRestId} value="short" />
              Short rest
            </Label>
            <Label
              htmlFor={longRestId}
              className="cursor-pointer rounded-lg border border-border bg-workspace-pane p-3"
            >
              <RadioGroupItem id={longRestId} value="long" />
              Long rest
            </Label>
          </RadioGroup>

          {restType === 'short' ? (
            <section className="rounded-lg border border-border bg-workspace-pane p-4">
              <h3 className="text-sm font-semibold">Hit points and hit dice stay unchanged</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Spending hit dice and rolling healing require player choices. Apply the rest, then
                use the Hit Points controls to record the result.
              </p>
            </section>
          ) : (
            <section className="space-y-4 rounded-lg border border-border bg-workspace-pane p-4">
              <div>
                <h3 className="text-sm font-semibold">Long-rest choices</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose only the recovery your current rules and circumstances allow.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id={restoreHitPointsId}
                  checked={restoreHitPoints}
                  onCheckedChange={(checked) => setRestoreHitPoints(checked === true)}
                />
                <Label htmlFor={restoreHitPointsId} className="block cursor-pointer leading-5">
                  Restore current hit points to maximum and clear temporary hit points
                </Label>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={hitDiceRecoveredId}>Hit dice to recover</Label>
                <Input
                  id={hitDiceRecoveredId}
                  type="number"
                  min={0}
                  max={hitDiceUsed}
                  step={1}
                  value={hitDiceRecoveredText}
                  onChange={(event) => setHitDiceRecoveredText(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {hitDiceUsed} currently marked used. Enter the amount allowed by the character's
                  rules.
                </p>
              </div>
            </section>
          )}

          <section aria-live="polite" className="space-y-2">
            <h3 className="text-sm font-semibold">Proposed changes</h3>
            {result?.changes.length ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-workspace-pane">
                {result.changes.map((change) => (
                  <li key={change.id} className="flex items-center justify-between gap-4 px-3 py-2">
                    <span className="text-sm">{change.label}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {change.before} → {change.after}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                This rest would not change any tracked values.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              These changes remain unsaved until you use Save changes.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!result?.changes.length} onClick={handleApply}>
            Apply {restType === 'short' ? 'short' : 'long'} rest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
