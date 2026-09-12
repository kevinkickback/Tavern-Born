import { GlobeHemisphereWest } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ItemGroup,
  LanguageSort,
  ProficiencyLedger,
  ProficiencyPanelCallbacks,
  ResolveChoiceSelection,
} from './types'

interface LanguagesPanelProps {
  groups: ItemGroup[]
  availableLanguages: string[]
  currentLanguages: CurrentProficiencies['languages']
  ledger: ProficiencyLedger
  sort: LanguageSort
  onSortChange: (sort: LanguageSort) => void
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
  onResolveChoiceSelection: ResolveChoiceSelection
}

export function LanguagesPanel({
  groups,
  availableLanguages,
  currentLanguages,
  ledger,
  sort,
  onSortChange,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
}: LanguagesPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort:</span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as LanguageSort)}>
          <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha" className="text-xs">
              Alphabetical
            </SelectItem>
            <SelectItem value="type" className="text-xs">
              By type
            </SelectItem>
            <SelectItem value="proficient" className="text-xs">
              Proficient first
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {availableLanguages.length === 0 ? (
        <p className="text-muted-foreground text-sm">No languages available in game data</p>
      ) : (
        groups.map(({ label, items }) => (
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
              {items.map((languageName) => {
                const normLang = normalizeKey(languageName)
                const sourceTags = ledger.proficiencies.languages[normLang] ?? []
                const hasLedgerGrant = sourceTags.length > 0
                const isSelected = hasProfInArray(currentLanguages, languageName) || hasLedgerGrant
                const isChoiceSelected = ledger.choices.some(
                  (choice) =>
                    choice.domain === 'languages' &&
                    choice.selected.some((selected) => normalizeKey(selected) === normLang),
                )
                const canSelect =
                  !isSelected &&
                  ledger.choices.some(
                    (choice) =>
                      choice.domain === 'languages' &&
                      choice.selected.length < choice.chooseCount &&
                      (choice.optionPool.length === 0 ||
                        choice.optionPool.some(
                          (poolEntry) => normalizeKey(poolEntry) === normLang,
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
                const focusLanguage = () => {
                  onFocusChange({
                    type: 'item',
                    category: 'languages',
                    name: languageName,
                    isProficient: isSelected,
                  })
                  onExpandDetails()
                }

                return (
                  <button
                    key={languageName}
                    type="button"
                    onClick={() => {
                      if (canDeselect) onResolveChoiceSelection('languages', languageName, false)
                      else if (canSelect) onResolveChoiceSelection('languages', languageName, true)
                    }}
                    onMouseEnter={focusLanguage}
                    onFocus={focusLanguage}
                    title={
                      canDeselect
                        ? `Remove choice: ${formatProfLabel(languageName)}`
                        : isSelected
                          ? `${formatProfLabel(languageName)} is granted and cannot be removed`
                          : canSelect
                            ? `Choose ${formatProfLabel(languageName)}`
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
                      fallback={
                        <GlobeHemisphereWest className="size-3.5 shrink-0" aria-hidden="true" />
                      }
                    />
                    <span className="truncate">{formatProfLabel(languageName)}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <ProficiencyStatus state={rowState} />
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
