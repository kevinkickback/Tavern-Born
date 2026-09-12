import { Wrench } from '@phosphor-icons/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizeKey } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import {
  hasProfInArray,
  hasUnresolvedChoiceForKind,
  normalizeGenericToolKind,
} from '@/pages/build/proficiencies/model/data'
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
  ToolPanelChoices,
  ToolSort,
} from './types'

interface ToolsPanelProps extends ToolPanelChoices {
  groups: ItemGroup[]
  visibleToolCandidates: string[]
  currentTools: CurrentProficiencies['tools']
  ledger: ProficiencyLedger
  sort: ToolSort
  onSortChange: (sort: ToolSort) => void
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
  onResolveChoiceSelection: ResolveChoiceSelection
}

export function ToolsPanel({
  groups,
  visibleToolCandidates,
  currentTools,
  ledger,
  sort,
  onSortChange,
  dropdownToolSlots,
  artisanToolSlots,
  artisanChoiceByNorm,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
}: ToolsPanelProps) {
  return (
    <div className="space-y-4">
      {dropdownToolSlots.length > 0 && (
        <div className="w-full space-y-2">
          {dropdownToolSlots.map((slot) => (
            <div
              key={slot.id}
              className="w-full max-w-lg border-l-2 border-primary/50 bg-secondary/20 px-3 py-2.5"
            >
              <p className="mb-2 text-sm text-muted-foreground">
                {slot.sourceName}: choose {formatProfLabel(slot.label)}
              </p>
              <Select
                onValueChange={(value) => {
                  onResolveChoiceSelection('tools', value, true, slot.choiceId)
                  onFocusChange({
                    type: 'item',
                    category: 'tools',
                    name: value,
                    isProficient: true,
                  })
                  onExpandDetails()
                }}
                disabled={slot.options.length === 0}
              >
                <SelectTrigger className="h-9 cursor-pointer border-dashed">
                  <SelectValue placeholder={`${formatProfLabel(slot.label)} (choose type)`} />
                </SelectTrigger>
                <SelectContent>
                  {slot.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatProfLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort:</span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as ToolSort)}>
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
      {visibleToolCandidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tools available in game data</p>
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
              {items.map((toolName) => {
                const normTool = normalizeKey(toolName)
                const genericKind = normalizeGenericToolKind(toolName)
                const isGenericKind = Boolean(genericKind)
                const hasOptionalChoiceForKind = genericKind
                  ? hasUnresolvedChoiceForKind(ledger.choices, genericKind)
                  : false
                const sourceTags = ledger.proficiencies.tools[normTool] ?? []
                const hasLedgerGrant = sourceTags.length > 0
                const isSelected = hasProfInArray(currentTools, toolName) || hasLedgerGrant
                const isChoiceSelected = ledger.choices.some(
                  (choice) =>
                    choice.domain === 'tools' &&
                    choice.selected.some((selected) => normalizeKey(selected) === normTool),
                )
                const artisanChoiceId = artisanChoiceByNorm.get(normTool)
                const canSelect =
                  !isSelected &&
                  (ledger.choices.some(
                    (choice) =>
                      choice.domain === 'tools' &&
                      choice.selected.length < choice.chooseCount &&
                      (choice.optionPool.length === 0 ||
                        choice.optionPool.some(
                          (poolEntry) => normalizeKey(poolEntry) === normTool,
                        )),
                  ) ||
                    artisanToolSlots.some((slot) =>
                      slot.options.some((option) => normalizeKey(option) === normTool),
                    ))
                const canDeselect = isChoiceSelected
                const rowState: ProficiencyRowState = isChoiceSelected
                  ? 'chosen'
                  : isSelected
                    ? 'granted'
                    : canSelect || (isGenericKind && hasOptionalChoiceForKind)
                      ? 'available'
                      : 'unavailable'
                const focusTool = () => {
                  onFocusChange({
                    type: 'item',
                    category: 'tools',
                    name: toolName,
                    isProficient: isSelected,
                  })
                  onExpandDetails()
                }

                return (
                  <button
                    key={toolName}
                    type="button"
                    onClick={() => {
                      if (isGenericKind) return
                      if (canDeselect) onResolveChoiceSelection('tools', toolName, false)
                      else if (canSelect)
                        onResolveChoiceSelection('tools', toolName, true, artisanChoiceId)
                    }}
                    onMouseEnter={focusTool}
                    onFocus={focusTool}
                    title={
                      canDeselect
                        ? `Remove choice: ${formatProfLabel(toolName)}`
                        : isSelected
                          ? `${formatProfLabel(toolName)} is granted and cannot be removed`
                          : canSelect
                            ? `Choose ${formatProfLabel(toolName)}`
                            : undefined
                    }
                    className={cn(
                      'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-surface-raised px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                      !isGenericKind && (canSelect || canDeselect)
                        ? 'cursor-pointer'
                        : 'cursor-default',
                      isGenericKind
                        ? hasOptionalChoiceForKind
                          ? 'bg-primary/5 text-foreground hover:bg-primary/10'
                          : 'bg-surface-raised text-foreground hover:bg-surface-hover'
                        : isChoiceSelected
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
                      actionable={!isGenericKind && (canSelect || canDeselect)}
                      fallback={<Wrench className="size-3.5 shrink-0" aria-hidden="true" />}
                    />
                    <span className="truncate">{formatProfLabel(toolName)}</span>
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
