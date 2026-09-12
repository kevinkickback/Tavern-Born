import { Sword } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeKey } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import { formatWeaponCategoryLabel, hasProfInArray } from '@/pages/build/proficiencies/model/data'
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
  ItemGroup,
  ProficiencyLedger,
  ProficiencyPanelCallbacks,
  ResolveChoiceSelection,
  WeaponSort,
} from './types'

interface WeaponsPanelProps {
  groups: ItemGroup[]
  currentWeapons: CurrentProficiencies['weapons']
  ledger: ProficiencyLedger
  sort: WeaponSort
  onSortChange: (sort: WeaponSort) => void
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
  onResolveChoiceSelection: ResolveChoiceSelection
}

export function WeaponsPanel({
  groups,
  currentWeapons,
  ledger,
  sort,
  onSortChange,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
}: WeaponsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort:</span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as WeaponSort)}>
          <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha" className="text-xs">
              Alphabetical
            </SelectItem>
            <SelectItem value="category" className="text-xs">
              By category
            </SelectItem>
            <SelectItem value="melee-ranged" className="text-xs">
              By type
            </SelectItem>
            <SelectItem value="proficient" className="text-xs">
              Proficient first
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {groups.map(({ label, items }) => (
        <div key={label ?? 'all'}>
          {label && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-workspace-pane 2xl:grid-cols-2">
            {items.map((weaponKey) => {
              const normWeapon = normalizeKey(weaponKey)
              const sourceTags = ledger.proficiencies.weapons[normWeapon] ?? []
              const hasLedgerGrant = sourceTags.length > 0
              const isSelected = hasProfInArray(currentWeapons, weaponKey) || hasLedgerGrant
              const isChoiceSelected = ledger.choices.some(
                (choice) =>
                  choice.domain === 'weapons' &&
                  choice.selected.some((selected) => normalizeKey(selected) === normWeapon),
              )
              const canSelect =
                !isSelected &&
                ledger.choices.some(
                  (choice) =>
                    choice.domain === 'weapons' &&
                    choice.selected.length < choice.chooseCount &&
                    (choice.optionPool.length === 0 ||
                      choice.optionPool.some(
                        (poolEntry) => normalizeKey(poolEntry) === normWeapon,
                      )),
                )
              const canDeselect = isChoiceSelected
              const rowState: ProficiencyRowState = isChoiceSelected
                ? 'chosen'
                : isSelected
                  ? 'granted'
                  : canSelect
                    ? 'available'
                    : 'unavailable'
              const focusWeapon = () => {
                onFocusChange({
                  type: 'item',
                  category: 'weapons',
                  name: weaponKey,
                  isProficient: isSelected,
                })
                onExpandDetails()
              }

              return (
                <button
                  key={weaponKey}
                  type="button"
                  onClick={() => {
                    if (canDeselect) onResolveChoiceSelection('weapons', weaponKey, false)
                    else if (canSelect) onResolveChoiceSelection('weapons', weaponKey, true)
                  }}
                  onMouseEnter={focusWeapon}
                  onFocus={focusWeapon}
                  title={
                    canDeselect
                      ? `Remove choice: ${formatProfLabel(weaponKey)}`
                      : isSelected
                        ? `${formatProfLabel(weaponKey)} is granted and cannot be removed`
                        : canSelect
                          ? `Choose ${formatProfLabel(weaponKey)}`
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
                    fallback={<Sword className="size-3.5 shrink-0" aria-hidden="true" />}
                  />
                  <span>{formatWeaponCategoryLabel(weaponKey) ?? formatProfLabel(weaponKey)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <ProficiencyStatus state={rowState} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
