import { Shield } from '@phosphor-icons/react'
import { normalizeKey } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import { hasProfInArray } from '@/pages/build/proficiencies/model/data'
import {
  choiceSelectedClass,
  fixedSelectedClass,
  formatProfLabel,
  type ProficiencyRowState,
  ProficiencyStateIcon,
  ProficiencyStatus,
} from './shared'
import type {
  CurrentProficiencies,
  ProficiencyLedger,
  ProficiencyPanelCallbacks,
  ResolveChoiceSelection,
} from './types'

interface ArmorPanelProps {
  availableArmor: string[]
  currentArmor: CurrentProficiencies['armor']
  ledger: ProficiencyLedger
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
  onResolveChoiceSelection: ResolveChoiceSelection
}

export function ArmorPanel({
  availableArmor,
  currentArmor,
  ledger,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
}: ArmorPanelProps) {
  return (
    <div className="space-y-4">
      <div className="h-8" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-workspace-pane sm:grid-cols-2">
        {availableArmor.map((armorKey) => {
          const normArmor = normalizeKey(armorKey)
          const sourceTags = ledger.proficiencies.armor[normArmor] ?? []
          const hasLedgerGrant = sourceTags.length > 0
          const isSelected = hasProfInArray(currentArmor, armorKey) || hasLedgerGrant
          const isChoiceSelected = ledger.choices.some(
            (choice) =>
              choice.domain === 'armor' &&
              choice.selected.some((selected) => normalizeKey(selected) === normArmor),
          )
          const canSelect =
            !isSelected &&
            ledger.choices.some(
              (choice) =>
                choice.domain === 'armor' &&
                choice.selected.length < choice.chooseCount &&
                (choice.optionPool.length === 0 ||
                  choice.optionPool.some((poolEntry) => normalizeKey(poolEntry) === normArmor)),
            )
          const canDeselect = isChoiceSelected
          const rowState: ProficiencyRowState = isChoiceSelected
            ? 'chosen'
            : isSelected
              ? 'granted'
              : canSelect
                ? 'available'
                : 'unavailable'
          const focusArmor = () => {
            onFocusChange({
              type: 'item',
              category: 'armor',
              name: armorKey,
              isProficient: isSelected,
            })
            onExpandDetails()
          }

          return (
            <button
              key={armorKey}
              type="button"
              onClick={() => {
                if (canDeselect) onResolveChoiceSelection('armor', armorKey, false)
                else if (canSelect) onResolveChoiceSelection('armor', armorKey, true)
              }}
              onMouseEnter={focusArmor}
              onFocus={focusArmor}
              title={
                canDeselect
                  ? `Remove choice: ${formatProfLabel(armorKey)}`
                  : isSelected
                    ? `${formatProfLabel(armorKey)} is granted and cannot be removed`
                    : canSelect
                      ? `Choose ${formatProfLabel(armorKey)}`
                      : undefined
              }
              className={cn(
                'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-surface-raised px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                isChoiceSelected
                  ? choiceSelectedClass
                  : isSelected
                    ? fixedSelectedClass
                    : canSelect
                      ? 'bg-surface-raised text-foreground hover:bg-surface-hover'
                      : 'bg-surface-raised text-foreground hover:bg-surface-hover',
              )}
            >
              <ProficiencyStateIcon
                state={rowState}
                actionable={canSelect || canDeselect}
                fallback={<Shield className="size-3.5 shrink-0" aria-hidden="true" />}
              />
              <span>{formatProfLabel(armorKey)}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <ProficiencyStatus state={rowState} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
