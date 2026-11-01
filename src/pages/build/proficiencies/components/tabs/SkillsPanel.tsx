import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SkillExpertiseAction } from '@/lib/character/skillExpertiseChoices'
import type { SkillProficiencyAction } from '@/lib/character/skillProficiencyChoices'
import { normalizeKey } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import {
  formatProfLabel,
  type ProficiencyRowState,
  ProficiencyStateIcon,
  ProficiencyStatus,
  proficiencyRowClass,
} from './shared'
import type {
  ProficiencyLedger,
  ProficiencyPanelCallbacks,
  ResolveChoiceSelection,
  SkillGroup,
  SkillSort,
} from './types'

interface SkillsPanelProps {
  groups: SkillGroup[]
  ledger: ProficiencyLedger
  sort: SkillSort
  onSortChange: (sort: SkillSort) => void
  onFocusChange: ProficiencyPanelCallbacks['onFocusChange']
  onExpandDetails: ProficiencyPanelCallbacks['onExpandDetails']
  onResolveChoiceSelection: ResolveChoiceSelection
  expertiseActions: Record<string, SkillExpertiseAction[]>
  onExpertiseAction: (skill: string, actionId: string) => void
  proficiencyActions?: Record<string, SkillProficiencyAction[]>
  onProficiencyAction?: (skill: string, actionId: string) => void
  classSkillChoicesRemaining?: number
}

export function SkillsPanel({
  groups,
  ledger,
  sort,
  onSortChange,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
  expertiseActions,
  onExpertiseAction,
  proficiencyActions,
  onProficiencyAction,
  classSkillChoicesRemaining = 0,
}: SkillsPanelProps) {
  const hasPendingSkillChoices =
    classSkillChoicesRemaining > 0 ||
    ledger.choices.some(
      (choice) => choice.domain === 'skills' && choice.selected.length < choice.chooseCount,
    )
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort:</span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as SkillSort)}>
          <SelectTrigger className="h-8 w-[150px] cursor-pointer text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alpha" className="text-xs">
              Alphabetical
            </SelectItem>
            <SelectItem value="ability" className="text-xs">
              By type
            </SelectItem>
            <SelectItem value="proficient" className="text-xs">
              Proficient first
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {groups.map(({ label, skills }) => (
        <div key={label ?? 'all'}>
          {label && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-3 gap-y-px 2xl:grid-cols-2">
            {skills.map((skill) => {
              const normName = skill.name
              const sourceTags = ledger.proficiencies.skills[normName] ?? []
              const hasLedgerGrant = sourceTags.length > 0
              const isSelected = skill.proficient || hasLedgerGrant
              const skillActions = proficiencyActions?.[normName] ?? []
              const isChoiceSelected = proficiencyActions
                ? skillActions.some((action) => !action.adding)
                : ledger.choices.some(
                    (choice) =>
                      choice.domain === 'skills' &&
                      choice.selected.some((selected) => normalizeKey(selected) === normName),
                  )
              const canSelect =
                !isSelected &&
                (proficiencyActions
                  ? skillActions.some((action) => action.adding)
                  : ledger.choices.some(
                      (choice) =>
                        choice.domain === 'skills' &&
                        choice.selected.length < choice.chooseCount &&
                        (choice.optionPool.length === 0 ||
                          choice.optionPool.some(
                            (poolEntry) => normalizeKey(poolEntry) === normName,
                          )),
                    ))
              const canDeselect = isChoiceSelected
              const excludedWhileChoosing = hasPendingSkillChoices && !isSelected && !canSelect
              const actions = expertiseActions[normName] ?? []
              const chooseSource =
                actions.length > 1 || (skill.expertise && actions.some((action) => action.adding))
              const canToggleExpertise = actions.length > 0
              const rowState: ProficiencyRowState = isChoiceSelected
                ? 'chosen'
                : isSelected
                  ? 'granted'
                  : canSelect
                    ? 'available'
                    : 'unavailable'
              const focusSkill = () => {
                onFocusChange({
                  type: 'skill',
                  name: skill.name,
                  ability: skill.ability,
                  proficient: isSelected,
                  expertise: skill.expertise,
                  modifierString: skill.modifierString,
                })
                onExpandDetails()
              }

              const circle = (
                <button
                  type="button"
                  disabled={!canToggleExpertise}
                  aria-pressed={skill.expertise}
                  aria-label={`${chooseSource ? 'Choose expertise source' : actions[0]?.adding ? 'Add expertise' : actions.length ? 'Remove expertise' : skill.expertise ? 'Expertise' : 'No expertise'}: ${formatProfLabel(skill.name)}`}
                  tabIndex={canToggleExpertise ? 0 : -1}
                  data-expertise-hint={canToggleExpertise ? 'true' : undefined}
                  title={
                    chooseSource
                      ? 'Choose an Expertise source'
                      : (actions[0]?.label ??
                        (skill.expertise ? 'Expertise granted by another source' : undefined))
                  }
                  onClick={() => {
                    if (!canToggleExpertise) return
                    if (!chooseSource && actions.length === 1)
                      onExpertiseAction(skill.name, actions[0].id)
                  }}
                  className={cn(
                    'min-w-10 px-3 self-stretch flex items-center justify-center border-r border-current/20 shrink-0 focus-visible:outline-none',
                    canToggleExpertise
                      ? 'cursor-pointer text-foreground hover:opacity-70'
                      : 'cursor-default',
                  )}
                >
                  <span
                    data-expertise-indicator={skill.expertise ? 'selected' : 'empty'}
                    className={cn(
                      'size-4 rounded-full border-2 border-current transition-colors pointer-events-none',
                      skill.expertise ? 'bg-current' : 'bg-transparent',
                      !skill.expertise && !canToggleExpertise && 'text-muted-foreground/40',
                    )}
                  />
                </button>
              )
              const proficiencyButton = (
                <button
                  type="button"
                  aria-disabled={!canSelect && !canDeselect}
                  onClick={() => {
                    if (proficiencyActions) {
                      if (skillActions.length === 1)
                        onProficiencyAction?.(skill.name, skillActions[0].id)
                    } else if (canDeselect) onResolveChoiceSelection('skills', skill.name, false)
                    else if (canSelect) onResolveChoiceSelection('skills', skill.name, true)
                  }}
                  title={
                    skillActions.length > 1
                      ? 'Choose a proficiency source'
                      : canDeselect
                        ? `Remove choice: ${formatProfLabel(skill.name)}`
                        : isSelected
                          ? `${formatProfLabel(skill.name)} is granted and cannot be removed`
                          : canSelect
                            ? `Choose ${formatProfLabel(skill.name)}`
                            : excludedWhileChoosing
                              ? 'Not available for your remaining skill choices'
                              : undefined
                  }
                  className={cn(
                    'group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none',
                    canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <ProficiencyStateIcon state={rowState} actionable={canSelect || canDeselect} />
                  <span className="truncate">{formatProfLabel(skill.name)}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="text-xs font-normal text-muted-foreground">
                      {skill.ability.toUpperCase()}
                    </span>
                    <ProficiencyStatus state={rowState} />
                  </span>
                </button>
              )
              return (
                <fieldset
                  key={skill.name}
                  onMouseEnter={focusSkill}
                  onFocusCapture={focusSkill}
                  aria-label={`${formatProfLabel(skill.name)} proficiency`}
                  className={cn(
                    'inline-flex min-h-11 min-w-0 items-stretch overflow-hidden bg-surface-raised text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors first:rounded-t-md last:rounded-b-md focus-within:z-10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset 2xl:[&:nth-child(2)]:rounded-t-md 2xl:[&:nth-last-child(2)]:rounded-b-md',
                    proficiencyRowClass(rowState, hasPendingSkillChoices),
                  )}
                >
                  {chooseSource ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>{circle}</DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>
                          {formatProfLabel(skill.name)} Expertise
                        </DropdownMenuLabel>
                        <DropdownMenuLabel className="max-w-80 whitespace-normal text-xs font-normal text-muted-foreground">
                          {skill.expertise
                            ? 'This skill already has Expertise. Using another source spends its choice and keeps the circle filled. Removing one source may leave another.'
                            : 'Each choice uses its own source. Choose which source to use.'}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {actions.map((action) => (
                          <DropdownMenuItem
                            key={action.id}
                            onSelect={() => onExpertiseAction(skill.name, action.id)}
                          >
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    circle
                  )}
                  {skillActions.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>{proficiencyButton}</DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuLabel>
                          {formatProfLabel(skill.name)} proficiency
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {skillActions.map((action) => (
                          <DropdownMenuItem
                            key={action.id}
                            onSelect={() => onProficiencyAction?.(skill.name, action.id)}
                          >
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    proficiencyButton
                  )}
                </fieldset>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
