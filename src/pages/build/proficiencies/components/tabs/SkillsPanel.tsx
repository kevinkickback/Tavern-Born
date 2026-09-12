import { Brain } from '@phosphor-icons/react'
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
  choiceSelectedClass,
  fixedSelectedClass,
  formatProfLabel,
  type ProficiencyRowState,
  ProficiencyStateIcon,
  ProficiencyStatus,
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
  onToggleExpertise: (skillName: string) => void
  availableExpertiseSlots: number
  usedExpertiseSlots: number
}

export function SkillsPanel({
  groups,
  ledger,
  sort,
  onSortChange,
  onFocusChange,
  onExpandDetails,
  onResolveChoiceSelection,
  onToggleExpertise,
  availableExpertiseSlots,
  usedExpertiseSlots,
}: SkillsPanelProps) {
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
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-workspace-pane 2xl:grid-cols-2">
            {skills.map((skill) => {
              const normName = skill.name
              const sourceTags = ledger.proficiencies.skills[normName] ?? []
              const hasLedgerGrant = sourceTags.length > 0
              const isSelected = skill.proficient || hasLedgerGrant
              const isChoiceSelected = ledger.choices.some(
                (choice) =>
                  choice.domain === 'skills' &&
                  choice.selected.some((selected) => normalizeKey(selected) === normName),
              )
              const canSelect =
                !isSelected &&
                ledger.choices.some(
                  (choice) =>
                    choice.domain === 'skills' &&
                    choice.selected.length < choice.chooseCount &&
                    (choice.optionPool.length === 0 ||
                      choice.optionPool.some((poolEntry) => normalizeKey(poolEntry) === normName)),
                )
              const canDeselect = isChoiceSelected
              const canAddExpertise =
                isSelected && !skill.expertise && usedExpertiseSlots < availableExpertiseSlots
              const canRemoveExpertise = isSelected && skill.expertise
              const canToggleExpertise = canAddExpertise || canRemoveExpertise
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

              return (
                <fieldset
                  key={skill.name}
                  onMouseEnter={focusSkill}
                  onFocusCapture={focusSkill}
                  aria-label={`${formatProfLabel(skill.name)} proficiency`}
                  className={cn(
                    'inline-flex min-h-11 min-w-0 items-stretch overflow-hidden bg-surface-raised text-sm font-medium text-foreground ring-1 ring-border/75 ring-inset transition-colors focus-within:z-10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset',
                    isChoiceSelected
                      ? choiceSelectedClass
                      : isSelected
                        ? fixedSelectedClass
                        : canSelect
                          ? 'bg-surface-raised text-foreground hover:bg-surface-hover'
                          : 'bg-surface-raised text-foreground hover:bg-surface-hover',
                  )}
                >
                  <button
                    type="button"
                    tabIndex={canToggleExpertise ? 0 : -1}
                    data-expertise-hint={canToggleExpertise ? 'true' : undefined}
                    title={
                      canRemoveExpertise
                        ? `Remove expertise: ${formatProfLabel(skill.name)}`
                        : canAddExpertise
                          ? `Add expertise: ${formatProfLabel(skill.name)}`
                          : undefined
                    }
                    onClick={() => {
                      if (canToggleExpertise) onToggleExpertise(skill.name)
                    }}
                    className={cn(
                      'px-2 self-stretch flex flex-col items-center justify-center gap-1 border-r border-current/20 shrink-0 focus-visible:outline-none',
                      canToggleExpertise ? 'cursor-pointer hover:opacity-70' : 'cursor-default',
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-colors pointer-events-none',
                        isSelected ? 'bg-current' : 'bg-current/20',
                      )}
                    />
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full transition-colors pointer-events-none',
                        skill.expertise ? 'bg-current' : 'bg-current/20',
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canDeselect) onResolveChoiceSelection('skills', skill.name, false)
                      else if (canSelect) onResolveChoiceSelection('skills', skill.name, true)
                    }}
                    title={
                      canDeselect
                        ? `Remove choice: ${formatProfLabel(skill.name)}`
                        : isSelected
                          ? `${formatProfLabel(skill.name)} is granted and cannot be removed`
                          : canSelect
                            ? `Choose ${formatProfLabel(skill.name)}`
                            : undefined
                    }
                    className={cn(
                      'group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none',
                      canSelect || canDeselect ? 'cursor-pointer' : 'cursor-default',
                    )}
                  >
                    <ProficiencyStateIcon
                      state={rowState}
                      actionable={canSelect || canDeselect}
                      fallback={<Brain className="size-3.5 shrink-0" aria-hidden="true" />}
                    />
                    <span className="truncate">{formatProfLabel(skill.name)}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      <span className="text-xs font-normal text-muted-foreground">
                        {skill.ability.toUpperCase()}
                      </span>
                      <ProficiencyStatus state={rowState} />
                    </span>
                  </button>
                </fieldset>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
