import { ShieldCheck } from '@phosphor-icons/react'
import { normalizeKey } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import {
  fixedSelectedClass,
  formatProfLabel,
  type ProficiencyRowState,
  ProficiencyStateIcon,
  ProficiencyStatus,
} from './shared'
import type { ProficiencyLedger, ProficiencyPanelCallbacks, SavingThrowRow } from './types'

const SAVE_ABBREVIATIONS: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
}

interface SavingThrowsPanelProps {
  savingThrows: SavingThrowRow[]
  ledger: ProficiencyLedger
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
}

export function SavingThrowsPanel({
  savingThrows,
  ledger,
  onFocusChange,
  onExpandDetails,
}: SavingThrowsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="h-8" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-workspace-pane sm:grid-cols-2 2xl:grid-cols-3">
        {savingThrows.map((save) => {
          const normAbility = normalizeKey(save.ability)
          const abbr = SAVE_ABBREVIATIONS[normAbility]
          const sourceTags = [
            ...(ledger.proficiencies.savingThrows[normAbility] ?? []),
            ...(abbr ? (ledger.proficiencies.savingThrows[abbr] ?? []) : []),
          ]
          const hasLedgerGrant = sourceTags.length > 0
          const isSelected = save.proficient || hasLedgerGrant
          const rowState: ProficiencyRowState = isSelected ? 'granted' : 'unavailable'
          const focusSave = () => {
            onFocusChange({
              type: 'save',
              ability: save.ability,
              proficient: isSelected,
              modifierString: save.modifierString,
            })
            onExpandDetails()
          }

          return (
            <button
              key={save.ability}
              type="button"
              onMouseEnter={focusSave}
              onFocus={focusSave}
              className={cn(
                'group inline-flex min-h-11 min-w-0 cursor-default items-center gap-2 bg-surface-raised px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                isSelected
                  ? fixedSelectedClass
                  : 'bg-surface-raised text-foreground hover:bg-surface-hover',
              )}
            >
              <ProficiencyStateIcon
                state={rowState}
                fallback={<ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />}
              />
              <span>{formatProfLabel(save.ability)}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-xs font-normal text-muted-foreground">
                  {save.modifierString}
                </span>
                <ProficiencyStatus state={rowState} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
