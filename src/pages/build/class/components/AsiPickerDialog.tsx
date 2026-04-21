import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ABILITY_ABBREVIATIONS, ABILITY_NAMES } from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_MAX } from '@/lib/calculations/gameRules'
import { cn } from '@/lib/utils'
import type { AbilityName, AbilityScores } from '@/types/character'

export interface AsiPickerDialogProps {
  open: boolean
  level: number
  abilityScores: AbilityScores
  existingChanges?: Record<string, 1 | 2>
  onApply: (changes: Record<string, 1 | 2>) => void
  onClose: () => void
}

type Mode = 'single' | 'split'

function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

export function AsiPickerDialog({
  open,
  level,
  abilityScores,
  existingChanges,
  onApply,
  onClose,
}: AsiPickerDialogProps) {
  // Strip existing changes so baseScores reflect pre-ASI values.
  const baseScores = useMemo<AbilityScores>(() => {
    const result = { ...abilityScores }
    for (const [ability, bonus] of Object.entries(existingChanges ?? {})) {
      ;(result as Record<string, number>)[ability] -= bonus
    }
    return result
  }, [abilityScores, existingChanges])

  const [mode, setMode] = useState<Mode>('single')
  const [selected, setSelected] = useState<AbilityName[]>([])

  // Sync state from existingChanges whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    const keys = Object.keys(existingChanges ?? {}) as AbilityName[]
    const values = Object.values(existingChanges ?? {})
    setMode(values.length > 1 ? 'split' : 'single')
    setSelected(keys)
  }, [open, existingChanges])

  const handleModeChange = (next: Mode) => {
    setMode(next)
    setSelected([])
  }

  const getBonus = (ability: AbilityName): 0 | 1 | 2 => {
    if (!selected.includes(ability)) return 0
    return mode === 'single' ? 2 : 1
  }

  const handleCardClick = (ability: AbilityName) => {
    if (mode === 'single') {
      setSelected(selected[0] === ability ? [] : [ability])
      return
    }
    if (selected.includes(ability)) {
      setSelected(selected.filter((a) => a !== ability))
    } else if (selected.length < 2) {
      setSelected([...selected, ability])
    }
  }

  const canApply = mode === 'single' ? selected.length === 1 : selected.length === 2

  const handleApply = () => {
    if (!canApply) return
    const changes: Record<string, 1 | 2> = {}
    for (const ability of selected) {
      changes[ability] = mode === 'single' ? 2 : 1
    }
    onApply(changes)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ability Score Increase — Level {level}</DialogTitle>
          <DialogDescription>Choose how to spend your ability score increase.</DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'single', display: '+2', sub: 'One ability score' },
              { value: 'split', display: '+1 / +1', sub: 'Two ability scores' },
            ] as { value: Mode; display: string; sub: string }[]
          ).map(({ value, display, sub }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleModeChange(value)}
              className={cn(
                'rounded-lg border-2 p-4 text-center transition-colors',
                mode === value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50',
              )}
            >
              <div className="text-2xl font-bold">{display}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
            </button>
          ))}
        </div>

        {/* Ability score grid */}
        <div className="grid grid-cols-3 gap-2">
          {ABILITY_NAMES.map((ability) => {
            const abbr = ABILITY_ABBREVIATIONS[ability]
            const base = baseScores[ability]
            const bonus = getBonus(ability)
            const newScore = Math.min(base + bonus, ABILITY_SCORE_MAX)
            const isSelected = selected.includes(ability)
            const isCapped = base >= ABILITY_SCORE_MAX
            const isDisabled =
              (!isSelected && mode === 'split' && selected.length >= 2) || (isCapped && !isSelected)

            return (
              <button
                key={ability}
                type="button"
                onClick={() => !isDisabled && handleCardClick(ability)}
                disabled={isDisabled}
                className={cn(
                  'rounded-lg border-2 p-3 text-center transition-all select-none',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : isDisabled
                      ? 'border-border opacity-40 cursor-not-allowed'
                      : 'border-border hover:border-primary/50 cursor-pointer',
                )}
              >
                <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                  {abbr}
                </div>
                <div
                  className={cn(
                    'text-3xl font-bold leading-tight my-1',
                    isSelected && bonus > 0 && 'text-primary',
                  )}
                >
                  {newScore}
                </div>
                {isSelected && bonus > 0 ? (
                  <div className="text-[11px] font-medium text-primary">
                    {base} +{bonus} → {newScore}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{abilityModifier(newScore)}</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Hint */}
        <p className="text-xs text-muted-foreground text-center -mt-1">
          {mode === 'single'
            ? 'Select one ability to increase by 2.'
            : `Select two abilities to increase by 1 each. (${selected.length}/2 chosen)`}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canApply} onClick={handleApply}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
