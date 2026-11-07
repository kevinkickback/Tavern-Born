import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getRacialSourceDisplayName,
  type RaceDisplaySelection,
} from '@/lib/calculations/raceDisplay'
import { normalizeKey } from '@/lib/provenance/normalization'
import { cn } from '@/lib/utils'
import { normalizeGenericToolKind } from '@/pages/build/proficiencies/model/data'
import {
  formatProfLabel,
  type ProficiencyRowState,
  ProficiencyStateIcon,
  ProficiencyStatus,
  proficiencyRowClass,
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
  expertiseTools?: string[]
  ledger: ProficiencyLedger
  raceSelection?: RaceDisplaySelection
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
  expertiseTools = [],
  ledger,
  raceSelection,
  sort,
  onSortChange,
  toolChoiceSlots,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
}: ToolsPanelProps) {
  const hasPendingChoices = ledger.choices.some(
    (choice) => choice.domain === 'tools' && choice.selected.length < choice.chooseCount,
  )
  return (
    <div className="space-y-4">
      {toolChoiceSlots.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {toolChoiceSlots.map((slot) => (
            <li key={slot.id}>
              {slot.sourceName}
              {slot.source && ' (' + slot.source + ')'}: choose {slot.remaining}{' '}
              {formatProfLabel(slot.label)}
              {slot.options.length === 0 && ' · No eligible tools available'}
            </li>
          ))}
        </ul>
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
                const sourceTags = ledger.proficiencies.tools[normTool] ?? []
                const isSelected =
                  currentTools.some((name) => normalizeKey(name) === normTool) ||
                  sourceTags.length > 0
                const savedChoices = ledger.choices.filter(
                  (choice) =>
                    choice.domain === 'tools' &&
                    choice.selected.some((selected) => normalizeKey(selected) === normTool),
                )
                const isChoiceSelected = savedChoices.length > 0
                const options = isChoiceSelected
                  ? savedChoices.map((choice) => ({
                      id: choice.id,
                      sourceName: getRacialSourceDisplayName(raceSelection, choice.sourceTag),
                      source: choice.sourceTag.sourceRef,
                      label:
                        normalizeGenericToolKind(choice.optionPool[0] ?? '') ?? 'tool proficiency',
                    }))
                  : !isSelected && !genericKind
                    ? toolChoiceSlots
                        .filter((slot) =>
                          slot.options.some((option) => normalizeKey(option) === normTool),
                        )
                        .map(({ id, sourceName, source, label }) => ({
                          id,
                          sourceName,
                          source,
                          label,
                        }))
                    : []
                const actionable = options.length > 0
                const rowState: ProficiencyRowState = isChoiceSelected
                  ? 'chosen'
                  : isSelected
                    ? 'granted'
                    : actionable
                      ? 'available'
                      : 'unavailable'
                const focusTool = () => {
                  onFocusChange({
                    type: 'item',
                    category: 'tools',
                    name: toolName,
                    isProficient: isSelected,
                  })
                  onExpandDetails(true)
                }

                const choose = (id: string) =>
                  onResolveChoiceSelection('tools', toolName, !isChoiceSelected, id)
                const action = isChoiceSelected ? 'Remove choice' : 'Choose'
                const button = (
                  <button
                    key={toolName}
                    type="button"
                    onClick={() => {
                      if (options.length === 1) choose(options[0].id)
                      if (!actionable) {
                        focusTool()
                        onExpandDetails()
                      }
                    }}
                    onMouseEnter={focusTool}
                    onFocus={focusTool}
                    title={actionable ? action + ': ' + formatProfLabel(toolName) : undefined}
                    className={cn(
                      'group inline-flex min-h-11 min-w-0 items-center gap-2 bg-surface-raised px-3 py-2.5 text-left text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                      actionable ? 'cursor-pointer' : 'cursor-default',
                      proficiencyRowClass(rowState, hasPendingChoices),
                    )}
                  >
                    <ProficiencyStateIcon state={rowState} actionable={actionable} />
                    <span className="truncate">
                      {formatProfLabel(toolName)}
                      {genericKind && isChoiceSelected && ' (choose a specific tool)'}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {expertiseTools.some(
                        (name) => normalizeKey(name) === normalizeKey(toolName),
                      ) && <span className="text-xs text-primary">Expertise</span>}
                      {genericKind && isChoiceSelected ? (
                        <span className="text-xs font-medium text-warning">Needs choice</span>
                      ) : (
                        <ProficiencyStatus state={rowState} />
                      )}
                    </span>
                  </button>
                )
                if (options.length < 2) return button
                return (
                  <DropdownMenu key={toolName}>
                    <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {options.map(({ id, sourceName, source, label }) => {
                        const related = options.filter(
                          (option) => option.sourceName === sourceName && option.source === source,
                        )
                        const relatedLabel = related.filter((option) => option.label === label)
                        return (
                          <DropdownMenuItem key={id} onSelect={() => choose(id)}>
                            {action}: {sourceName}
                            {source && ' (' + source + ')'}
                            {related.length > 1 && ' · ' + formatProfLabel(label)}
                            {relatedLabel.length > 1 &&
                              ' ' + (relatedLabel.findIndex((option) => option.id === id) + 1)}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
