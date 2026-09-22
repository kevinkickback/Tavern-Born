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
import type { CreatureChoiceSummary } from '@/lib/5etools/creatureStatBlock'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
} from '@/lib/character/classChoiceOptions'
import { cn } from '@/lib/utils'
import type { NormalizedCharacterChoice } from '@/types/classRules'

const ENTITY_LABELS = {
  classFeature: 'Class feature',
  subclassFeature: 'Subclass feature',
  feat: 'Feat',
  item: 'Item',
  optionalFeature: 'Optional feature',
  creature: 'Creature',
} as const

function masteryKey(mastery: { name: string; source?: string }): string {
  return `${mastery.name.trim().toLowerCase()}|${mastery.source?.trim().toLowerCase() ?? ''}`
}

function titleCase(value: string): string {
  return value.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())
}

function hasSelectedValue(selected: Set<string> | undefined, actual: readonly string[]): boolean {
  if (!selected?.size) return true
  return actual.some((value) => selected.has(value))
}

function getEntryKey(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const named = entry as { name?: unknown }
    if (typeof named.name === 'string') return named.name
    return JSON.stringify(entry)
  }
  return String(entry)
}

function withEntryKeys(entries: unknown[], prefix: string) {
  const occurrences = new Map<string, number>()
  return entries.map((entry) => {
    const contentKey = getEntryKey(entry)
    const occurrence = occurrences.get(contentKey) ?? 0
    occurrences.set(contentKey, occurrence + 1)
    return { entry, key: `${prefix}:${contentKey}:${occurrence}` }
  })
}

function CreatureOptionSummary({ summary }: { summary: CreatureChoiceSummary }) {
  const stats = [
    { label: 'AC', value: summary.armorClass },
    { label: 'HP', value: summary.hitPoints },
    { label: 'Speed', value: summary.speed },
  ].filter((stat) => stat.value)
  const traits = summary.traits.slice(0, 4)
  const firstAction = summary.actions[0]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {summary.subtitle && <span className="italic">{summary.subtitle}</span>}
        {summary.challenge && (
          <Badge variant="secondary" className="h-5 px-1.5 py-0 text-xs">
            CR {summary.challenge}
          </Badge>
        )}
      </div>
      {stats.length > 0 && (
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded border border-border bg-border text-xs">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 bg-muted/60 px-2 py-1.5 text-center">
              <div className="font-semibold text-muted-foreground">{stat.label}</div>
              <div className="truncate tabular-nums text-foreground" title={stat.value}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}
      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {traits.map((trait) => (
            <Badge key={trait.name} variant="outline" className="h-5 px-1.5 py-0 text-xs">
              {trait.name}
            </Badge>
          ))}
          {summary.traits.length > traits.length && (
            <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs text-muted-foreground">
              +{summary.traits.length - traits.length} traits
            </Badge>
          )}
        </div>
      )}
      {firstAction && (
        <div className="line-clamp-2 text-sm leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">{firstAction.name}. </span>
          {firstAction.entries[0] != null && (
            <GameContent entry={firstAction.entries[0]} className="inline [&_p]:inline" />
          )}
        </div>
      )}
    </div>
  )
}

function OptionMetadata({ option }: { option: ClassChoiceOptionView }) {
  const presentation = option.presentation
  if (!presentation || presentation.kind === 'creature') return null

  const labels: string[] = []
  if (presentation.kind === 'feature') {
    labels.push(...presentation.featureTypeLabels)
    if (presentation.level !== undefined) labels.push(`Level ${presentation.level}`)
  } else if (presentation.kind === 'feat') {
    if (presentation.categoryLabel) labels.push(presentation.categoryLabel)
  } else {
    labels.push(
      ...presentation.typeLabels.slice(0, 2),
      ...(presentation.rarity ? [titleCase(presentation.rarity)] : []),
      ...(presentation.damage ? [`Damage ${presentation.damage}`] : []),
      ...(presentation.armorClass ? [presentation.armorClass] : []),
      ...(presentation.range ? [`Range ${presentation.range}`] : []),
      ...(presentation.attunement ? ['Attunement'] : []),
      ...presentation.propertyLabels.slice(0, 4),
      ...(presentation.weight !== undefined ? [`${presentation.weight} lb.`] : []),
    )
  }
  if (!labels.length) return null
  const uniqueLabels = [...new Set(labels)]

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {uniqueLabels.map((label) => (
        <Badge key={label} variant="outline" className="h-5 px-1.5 py-0 text-xs">
          {label}
        </Badge>
      ))}
    </div>
  )
}

function OptionEntries({ option }: { option: ClassChoiceOptionView }) {
  if (!option.entries.length) return null
  const visibleEntries = withEntryKeys(
    option.entries.slice(0, 2),
    `${option.reference.entityType}:${option.reference.name}`,
  )
  const multiple = visibleEntries.length > 1

  return (
    <div className={cn('space-y-1.5', multiple && 'border-l-2 border-primary/20 pl-2')}>
      {visibleEntries.map(({ entry, key }) => (
        <GameContent
          key={key}
          entry={entry}
          className={cn(
            'text-sm leading-snug text-muted-foreground',
            multiple ? 'line-clamp-3' : 'line-clamp-5',
          )}
        />
      ))}
      {option.entries.length > visibleEntries.length && (
        <p className="text-xs text-muted-foreground">
          +{option.entries.length - visibleEntries.length} more rules section
          {option.entries.length - visibleEntries.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
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
          {!isClassChoiceOptionEligible(option) && (
            <Badge variant="outline" className="h-5 border-warning/40 px-1.5 py-0 text-xs">
              Unavailable
            </Badge>
          )}
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
      {!isClassChoiceOptionEligible(option) && (
        <div className="mb-1.5 flex items-start gap-1.5 rounded border border-warning/20 bg-warning/10 px-2 py-1.5">
          <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
          <div className="text-xs leading-snug text-warning-foreground">
            This saved option is no longer eligible. Choose an available replacement to continue.
          </div>
        </div>
      )}
      {!prerequisite.met && prerequisite.reasons.length > 0 && (
        <div className="mb-1.5 flex items-start gap-1.5 rounded border border-warning/20 bg-warning/10 px-2 py-1.5">
          <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
          <div className="text-xs leading-snug text-warning-foreground">
            {prerequisite.reasons.join(' · ')}
          </div>
        </div>
      )}
      <OptionMetadata option={option} />
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
      <div className={cn(!prerequisite.met && !selected && 'opacity-70')}>
        {option.presentation?.kind === 'creature' ? (
          <CreatureOptionSummary summary={option.presentation.summary} />
        ) : (
          <OptionEntries option={option} />
        )}
      </div>
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
        test: isClassChoiceOptionEligible,
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
    const creatureSummaries = options.flatMap((option) =>
      option.presentation?.kind === 'creature' ? [option.presentation.summary] : [],
    )
    const creatureSizes = [...new Set(creatureSummaries.flatMap((summary) => summary.sizes))].sort(
      (left, right) => left.localeCompare(right),
    )
    if (creatureSizes.length > 1) {
      sections.push({
        key: 'creatureSize',
        label: 'Size',
        type: 'checkboxes',
        columns: 1,
        options: creatureSizes.map((size) => ({ value: size.toLowerCase(), label: size })),
      })
    }
    const challengeRatings = new Map<string, number>()
    for (const summary of creatureSummaries) {
      if (summary.challenge) {
        challengeRatings.set(summary.challenge, summary.challengeValue ?? Number.POSITIVE_INFINITY)
      }
    }
    if (challengeRatings.size > 1) {
      sections.push({
        key: 'creatureChallenge',
        label: 'Challenge rating',
        type: 'checkboxes',
        columns: 1,
        options: [...challengeRatings]
          .sort(
            ([leftLabel, leftValue], [rightLabel, rightValue]) =>
              leftValue - rightValue || leftLabel.localeCompare(rightLabel),
          )
          .map(([value]) => ({ value, label: `CR ${value}` })),
      })
    }
    const movementModes = [
      ...new Set(
        creatureSummaries.flatMap((summary) =>
          summary.speedModes.filter((mode) => mode !== 'walk'),
        ),
      ),
    ].sort((left, right) => left.localeCompare(right))
    if (movementModes.length > 0) {
      sections.push({
        key: 'creatureMovement',
        label: 'Special movement',
        type: 'checkboxes',
        columns: 1,
        options: movementModes.map((mode) => ({ value: mode, label: titleCase(mode) })),
      })
    }
    const featureTypes = [
      ...new Set(
        options.flatMap((option) =>
          option.presentation?.kind === 'feature' ? option.presentation.featureTypeLabels : [],
        ),
      ),
    ].sort((left, right) => left.localeCompare(right))
    if (featureTypes.length > 1) {
      sections.push({
        key: 'featureType',
        label: 'Feature type',
        type: 'checkboxes',
        columns: 1,
        options: featureTypes.map((type) => ({ value: type, label: type })),
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
      const searchTarget = option.searchText ?? option.reference.name
      if (!searchTarget.toLowerCase().includes(search.trim().toLowerCase())) return false
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
      const creatureSummary =
        option.presentation?.kind === 'creature' ? option.presentation.summary : undefined
      if (
        !hasSelectedValue(
          activeFilters.creatureSize,
          creatureSummary?.sizes.map((size) => size.toLowerCase()) ?? [],
        )
      ) {
        return false
      }
      if (
        !hasSelectedValue(
          activeFilters.creatureChallenge,
          creatureSummary?.challenge ? [creatureSummary.challenge] : [],
        )
      ) {
        return false
      }
      if (
        !hasSelectedValue(
          activeFilters.creatureMovement,
          creatureSummary?.speedModes.filter((mode) => mode !== 'walk') ?? [],
        )
      ) {
        return false
      }
      if (
        !hasSelectedValue(
          activeFilters.featureType,
          option.presentation?.kind === 'feature' ? option.presentation.featureTypeLabels : [],
        )
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
    (
      option: ClassChoiceOptionView,
      selectedIds: Set<string>,
      allOptions: ClassChoiceOptionView[],
    ) => {
      const key = getClassChoiceOptionKey(option.reference)
      if (!isClassChoiceOptionEligible(option)) return false
      if (selectedIds.has(key)) return true
      if (!(prerequisiteByOptionKey.get(key)?.met ?? true)) return false
      const eligibleSelectionCount = allOptions.filter(
        (candidate) =>
          isClassChoiceOptionEligible(candidate) &&
          selectedIds.has(getClassChoiceOptionKey(candidate.reference)),
      ).length
      return eligibleSelectionCount < maximumSelections
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
