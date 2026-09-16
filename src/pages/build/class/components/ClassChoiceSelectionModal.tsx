import { Warning } from '@phosphor-icons/react'
import { memo, useCallback, useMemo } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceOptions'
import { cn } from '@/lib/utils'
import type { NormalizedCharacterChoice } from '@/types/classRules'

const ENTITY_LABELS = {
  classFeature: 'Class feature',
  feat: 'Feat',
  item: 'Item',
  optionalFeature: 'Optional feature',
} as const

function masteryKey(mastery: { name: string; source?: string }): string {
  return `${mastery.name.trim().toLowerCase()}|${mastery.source?.trim().toLowerCase() ?? ''}`
}

const ChoiceOptionCard = memo(function ChoiceOptionCard({
  option,
  selected,
  prerequisite,
}: {
  option: ClassChoiceOptionView
  selected: boolean
  prerequisite: { met: boolean; reasons: string[] }
}) {
  return (
    <div className="p-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span
          className={cn(
            'font-semibold leading-tight',
            !prerequisite.met && !selected && 'text-muted-foreground',
          )}
        >
          {option.reference.name}
        </span>
        <div className="flex shrink-0 gap-1">
          <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs text-muted-foreground">
            {option.reference.entityType === 'item' && (option.masteries?.length ?? 0) > 0
              ? 'Weapon'
              : ENTITY_LABELS[option.reference.entityType]}
          </Badge>
          {option.reference.source && (
            <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs text-muted-foreground">
              {option.reference.source}
            </Badge>
          )}
          {selected && <Badge className="h-5 bg-accent px-1.5 py-0 text-xs">Selected</Badge>}
        </div>
      </div>
      {!prerequisite.met && prerequisite.reasons.length > 0 && (
        <div className="mb-1.5 flex items-start gap-1.5 rounded border border-warning/20 bg-warning/10 px-2 py-1.5">
          <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
          <div className="text-xs leading-snug text-warning/90">
            {prerequisite.reasons.join(' · ')}
          </div>
        </div>
      )}
      {(option.masteries?.length ?? 0) > 0 && (
        <div className="mb-1.5 space-y-1.5">
          {option.masteries?.map((mastery) => (
            <div
              key={`${mastery.name}|${mastery.source ?? ''}`}
              className="rounded border border-border-subtle bg-surface-raised/60 px-2 py-1.5"
            >
              <Badge variant="secondary" className="h-5 px-1.5 py-0 text-xs">
                Mastery: {mastery.name}
              </Badge>
              {mastery.entries.length > 0 && (
                <GameContent
                  entry={mastery.entries}
                  className="mt-1 text-xs leading-snug text-muted-foreground"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {option.entries[0] != null && (
        <GameContent
          entry={option.entries[0]}
          className={cn(
            'line-clamp-3 text-sm leading-snug text-muted-foreground',
            !prerequisite.met && !selected && 'opacity-70',
          )}
        />
      )}
    </div>
  )
})

interface ClassChoiceSelectionModalProps {
  choice: NormalizedCharacterChoice
  options: ClassChoiceOptionView[]
  maximumSelections: number
  initialSelectedIds: string[]
  characterSnapshot: PrereqCharacterSnapshot
  className?: string
  onClose: () => void
  onConfirm: (selected: ClassChoiceOptionView[]) => void
}

export function ClassChoiceSelectionModal({
  choice,
  options,
  maximumSelections,
  initialSelectedIds,
  characterSnapshot,
  className,
  onClose,
  onConfirm,
}: ClassChoiceSelectionModalProps) {
  const limits = useMemo<CategoryLimit<ClassChoiceOptionView>[]>(
    () => [
      {
        key: 'all',
        label: 'selections',
        max: maximumSelections,
        test: () => true,
      },
    ],
    [maximumSelections],
  )
  const { prerequisiteByOptionKey, hasUnmetPrerequisites } = useMemo(() => {
    const results = new Map<string, { met: boolean; reasons: string[] }>()
    let hasUnmet = false
    for (const option of options) {
      const result = checkAllPrerequisites(option, characterSnapshot, { className })
      results.set(getClassChoiceOptionKey(option.reference), {
        met: result.met,
        reasons: result.failures,
      })
      if (!result.met) hasUnmet = true
    }
    return { prerequisiteByOptionKey: results, hasUnmetPrerequisites: hasUnmet }
  }, [characterSnapshot, className, options])
  const filterSections = useMemo<FilterSection[]>(() => {
    const sections: FilterSection[] = []
    const masteries = new Map<string, string>()
    for (const option of options) {
      for (const mastery of option.masteries ?? []) {
        masteries.set(masteryKey(mastery), mastery.name)
      }
    }
    if (masteries.size > 0) {
      sections.push({
        key: 'mastery',
        label: 'Mastery',
        type: 'checkboxes',
        columns: 1,
        options: [...masteries]
          .sort((left, right) => left[1].localeCompare(right[1]))
          .map(([value, label]) => ({ value, label })),
      })
    }
    const weaponCategories = [
      ...new Set(options.flatMap((option) => option.weaponCategory ?? [])),
    ].sort((left, right) => left.localeCompare(right))
    if (weaponCategories.length > 1) {
      sections.push({
        key: 'weaponCategory',
        label: 'Weapon category',
        type: 'checkboxes',
        columns: 1,
        options: weaponCategories.map((category) => ({
          value: category,
          label: category.charAt(0).toUpperCase() + category.slice(1),
        })),
      })
    }
    const weaponRanges = [...new Set(options.flatMap((option) => option.weaponRange ?? []))]
    if (weaponRanges.length > 1) {
      sections.push({
        key: 'weaponRange',
        label: 'Attack type',
        type: 'checkboxes',
        columns: 1,
        options: weaponRanges.map((range) => ({ value: range, label: range })),
      })
    }
    if (hasUnmetPrerequisites) {
      sections.push({
        key: 'prerequisite',
        label: 'Prerequisites',
        type: 'switches',
        options: [
          {
            value: 'showUnmet',
            label: 'Show options with unmet prerequisites',
          },
        ],
      })
    }
    return sections
  }, [hasUnmetPrerequisites, options])
  const matchItem = useCallback(
    (option: ClassChoiceOptionView, search: string, activeFilters: ActiveFilters) => {
      if (!option.reference.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      const masteryFilters = activeFilters.mastery
      if (
        masteryFilters?.size &&
        !(option.masteries ?? []).some((mastery) => masteryFilters.has(masteryKey(mastery)))
      ) {
        return false
      }
      if (
        activeFilters.weaponCategory?.size &&
        (!option.weaponCategory || !activeFilters.weaponCategory.has(option.weaponCategory))
      ) {
        return false
      }
      if (
        activeFilters.weaponRange?.size &&
        (!option.weaponRange || !activeFilters.weaponRange.has(option.weaponRange))
      ) {
        return false
      }
      if (initialSelectedIds.includes(getClassChoiceOptionKey(option.reference))) return true
      if (activeFilters.prerequisite?.has('showUnmet')) return true
      return prerequisiteByOptionKey.get(getClassChoiceOptionKey(option.reference))?.met ?? true
    },
    [initialSelectedIds, prerequisiteByOptionKey],
  )
  const renderCard = useCallback(
    (option: ClassChoiceOptionView, selected: boolean) => (
      <ChoiceOptionCard
        option={option}
        selected={selected}
        prerequisite={
          prerequisiteByOptionKey.get(getClassChoiceOptionKey(option.reference)) ?? {
            met: true,
            reasons: [],
          }
        }
      />
    ),
    [prerequisiteByOptionKey],
  )
  const canSelect = useCallback(
    (option: ClassChoiceOptionView, selectedIds: Set<string>) => {
      const key = getClassChoiceOptionKey(option.reference)
      if (selectedIds.has(key)) return true
      if (!(prerequisiteByOptionKey.get(key)?.met ?? true)) return false
      return selectedIds.size < maximumSelections
    },
    [maximumSelections, prerequisiteByOptionKey],
  )

  return (
    <SelectionModal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={
        choice.optionFilter?.requiresMastery
          ? `Choose weapons for ${choice.label}`
          : `Choose ${choice.label}`
      }
      items={options}
      getItemId={(option) => getClassChoiceOptionKey(option.reference)}
      renderCard={renderCard}
      matchItem={matchItem}
      filterSections={filterSections}
      categories={limits}
      canSelect={canSelect}
      initialSelectedIds={initialSelectedIds}
      onConfirm={(_ids, selected) => onConfirm(selected)}
    />
  )
}
