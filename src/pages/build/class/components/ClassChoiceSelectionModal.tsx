import { Warning } from '@phosphor-icons/react'
import { memo, type ReactNode, useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GameContent } from '@/components/editor/GameContent'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ARMOR_REPLICATION_CHOICE_ID,
  isArtificerReplicatePlanChoice,
} from '@/lib/5etools/artificerArmorReplication'
import { isArtificerInfusionChoice } from '@/lib/5etools/artificerInfusionPlans'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule, isOwnedExpertiseTarget } from '@/lib/5etools/classProficiencyRules'
import type { CreatureChoiceSummary } from '@/lib/5etools/creatureStatBlock'
import { isRevisedInvocationPoolId } from '@/lib/5etools/warlockInvocationCantripSource'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  isClassChoiceOptionEligibleInDraft,
  retainsInvocationWithoutPrerequisite,
} from '@/lib/character/classChoiceOptions'
import { getInvocationRepeatKey } from '@/lib/character/warlockInvocationChoices'
import { withStableContentKeys } from '@/lib/renderer/stableContentKeys'
import { cn } from '@/lib/utils'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { FavoredEnemySetup, type FavoredEnemySetupProps } from './FavoredEnemySetup'

const ENTITY_LABELS = {
  classFeature: 'Class feature',
  subclassFeature: 'Subclass feature',
  feat: 'Feat',
  item: 'Item',
  optionalFeature: 'Optional feature',
  psionic: 'Psionic',
  creature: 'Creature',
  featureOption: 'Feature option',
  proficiency: 'Proficiency',
} as const

function checkboxFilter(
  key: string,
  label: string,
  values: string[],
  labelFor = (value: string) => value,
  valueFor = (value: string) => value,
): FilterSection {
  return {
    key,
    label,
    type: 'checkboxes',
    columns: 1,
    options: values.map((value) => ({ value: valueFor(value), label: labelFor(value) })),
  }
}

const lower = (value: string) => value.toLowerCase()
const compare = (a: string, b: string) => a.localeCompare(b)
const artificerItemFilters = [
  checkboxFilter(
    'itemType',
    'Item type',
    ['Weapon', 'Armor', 'Shield', 'Ring', 'Other'],
    undefined,
    lower,
  ),
  checkboxFilter('attunement', 'Attunement', ['required', 'none'], (value) =>
    value === 'required' ? 'Requires attunement' : 'No attunement required',
  ),
]

function masteryKey(mastery: { name: string; source?: string }): string {
  return `${mastery.name.trim().toLowerCase()}|${mastery.source?.trim().toLowerCase() ?? ''}`
}

function titleCase(value: string): string {
  return value.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())
}

function getOptionSelectionKey(option: ClassChoiceOptionView) {
  return option.selectionKey ?? getClassChoiceOptionKey(option.reference)
}

function getOptionLabel(option: ClassChoiceOptionView): string {
  if (option.displayLabel) return option.displayLabel
  return option.reference.entityType === 'proficiency'
    ? titleCase(option.reference.name)
    : option.reference.name
}

function hasSelectedValue(
  selected: Set<string> | undefined,
  actual?: string | readonly string[],
): boolean {
  if (!selected?.size) return true
  return typeof actual === 'string'
    ? selected.has(actual)
    : !!actual?.some((value) => selected.has(value))
}

function OptionBadge({
  children,
  variant = 'outline',
  className,
}: {
  children: ReactNode
  variant?: 'outline' | 'secondary' | 'default'
  className?: string
}) {
  return (
    <Badge variant={variant} className={cn('h-5 px-1.5 py-0 text-xs', className)}>
      {children}
    </Badge>
  )
}

function OptionWarning({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-start gap-1.5 rounded border border-warning/20 bg-warning/10 px-2 py-1.5">
      <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" weight="fill" />
      <div className="text-xs leading-snug text-warning-foreground">{children}</div>
    </div>
  )
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
        {summary.challenge && <OptionBadge variant="secondary">CR {summary.challenge}</OptionBadge>}
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
            <OptionBadge key={trait.name}>{trait.name}</OptionBadge>
          ))}
          {summary.traits.length > traits.length && (
            <OptionBadge className="text-muted-foreground">
              +{summary.traits.length - traits.length} traits
            </OptionBadge>
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
    const { typeLabels, rarity, damage, armorClass, range, attunement, propertyLabels, weight } =
      presentation
    labels.push(...typeLabels.slice(0, 2))
    if (rarity) labels.push(titleCase(rarity))
    if (damage) labels.push(`Damage ${damage}`)
    if (armorClass) labels.push(armorClass)
    if (range) labels.push(`Range ${range}`)
    if (attunement) labels.push('Attunement')
    labels.push(...propertyLabels.slice(0, 4))
    if (weight !== undefined) labels.push(`${weight} lb.`)
  }
  if (!labels.length) return null
  const uniqueLabels = [...new Set(labels)]

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {uniqueLabels.map((label) => (
        <OptionBadge key={label}>{label}</OptionBadge>
      ))}
    </div>
  )
}

function OptionEntries({ option }: { option: ClassChoiceOptionView }) {
  if (!option.entries.length) return null
  const visibleEntries = withStableContentKeys(
    option.entries.slice(0, 2),
    `${option.reference.entityType}:${option.reference.name}`,
  )
  const multiple = visibleEntries.length > 1
  const remaining = option.entries.length - visibleEntries.length

  return (
    <div className="space-y-1.5">
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
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground">
          +{remaining} more rules section{remaining === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

const ChoiceOptionCard = memo(function ChoiceOptionCard({
  option,
  selected,
  prerequisite,
  removalOnly = false,
}: {
  option: ClassChoiceOptionView
  selected: boolean
  prerequisite: { met: boolean; reasons: string[] }
  removalOnly?: boolean
}) {
  const Title = option.reference.entityType === 'psionic' ? 'div' : 'span'
  return (
    <div className="p-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <Title
          className={cn(
            'font-semibold leading-tight',
            !prerequisite.met && !selected && 'text-muted-foreground',
          )}
        >
          {option.reference.entityType === 'psionic' ? (
            <GameContent
              entry={`{@psionic ${option.reference.name}|${option.reference.source ?? ''}}`}
            />
          ) : (
            getOptionLabel(option)
          )}
        </Title>
        <div className="flex shrink-0 gap-1">
          {option.reference.source && (
            <OptionBadge className="text-muted-foreground">{option.reference.source}</OptionBadge>
          )}
          {!isClassChoiceOptionEligible(option) && (
            <OptionBadge className="border-warning/40">Unavailable</OptionBadge>
          )}
          <OptionBadge className="text-muted-foreground">
            {option.reference.entityType === 'item' && (option.masteries?.length ?? 0) > 0
              ? 'Weapon'
              : ENTITY_LABELS[option.reference.entityType]}
          </OptionBadge>
          {selected && (
            <OptionBadge variant="default" className="bg-accent">
              Selected
            </OptionBadge>
          )}
        </div>
      </div>
      {!isClassChoiceOptionEligible(option) && (
        <OptionWarning>
          {option.unavailableReason ??
            (removalOnly
              ? 'Source rules are unavailable. Keep or remove this saved choice, or restore its source.'
              : 'This saved option is no longer eligible. Choose an available replacement to continue.')}
        </OptionWarning>
      )}
      {!prerequisite.met && prerequisite.reasons.length > 0 && (
        <OptionWarning>{prerequisite.reasons.join(' · ')}</OptionWarning>
      )}
      <OptionMetadata option={option} />
      {(option.masteries?.length ?? 0) > 0 && (
        <div className="mb-1.5 space-y-1.5">
          {option.masteries?.map((mastery) => (
            <div
              key={`${mastery.name}|${mastery.source ?? ''}`}
              className="rounded border border-border-subtle bg-surface-raised/60 px-2 py-1.5"
            >
              <OptionBadge variant="secondary">Mastery: {mastery.name}</OptionBadge>
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
  enemySetup?: FavoredEnemySetupProps
  historicalSetup?: {
    name: string
    alreadyProficient?: boolean
    onConfirm: (alreadyProficient: boolean) => void
  }
  choice: Pick<NormalizedCharacterChoice, 'label'> & Partial<NormalizedCharacterChoice>
  removalOnly?: boolean
  options: ClassChoiceOptionView[]
  maximumSelections: number
  initialSelectedIds: string[]
  characterSnapshot: PrereqCharacterSnapshot
  className?: string
  classSource?: string
  onClose: () => void
  onConfirm: (selected: ClassChoiceOptionView[]) => void
  getDraftError?: (selected: ClassChoiceOptionView[]) => string | undefined
}

export function ClassChoiceSelectionModal({
  choice,
  removalOnly = false,
  options,
  maximumSelections,
  initialSelectedIds,
  characterSnapshot,
  className,
  classSource,
  onClose,
  onConfirm,
  getDraftError,
  historicalSetup,
  enemySetup,
}: ClassChoiceSelectionModalProps) {
  const [editingHistory, setEditingHistory] = useState(false)
  const invocationCantrips = isRevisedInvocationPoolId(choice.id)
  const infusions = !removalOnly && isArtificerInfusionChoice(choice)
  const artificerItems =
    infusions ||
    (!removalOnly &&
      (isArtificerReplicatePlanChoice(choice) || choice.id === ARMOR_REPLICATION_CHOICE_ID))
  const limits = useMemo<CategoryLimit<ClassChoiceOptionView>[]>(
    () =>
      removalOnly
        ? []
        : [
            {
              key: 'all',
              label: 'selections',
              max: maximumSelections,
              test: invocationCantrips ? () => true : isClassChoiceOptionEligible,
            },
          ],
    [maximumSelections, removalOnly, invocationCantrips],
  )
  const { prerequisiteByOptionKey, hasUnmetPrerequisites } = useMemo(() => {
    const results = new Map<string, { met: boolean; reasons: string[] }>()
    let hasUnmet = false
    for (const option of options) {
      const result = checkAllPrerequisites(option, characterSnapshot, { className, classSource })
      results.set(getOptionSelectionKey(option), {
        met: result.met,
        reasons: result.failures,
      })
      if (!result.met || option.invocationPrerequisite || option.unavailableReason) hasUnmet = true
    }
    return { prerequisiteByOptionKey: results, hasUnmetPrerequisites: hasUnmet }
  }, [characterSnapshot, className, classSource, options])
  const filterSections = useMemo<FilterSection[]>(() => {
    const sections: FilterSection[] = []
    if (infusions)
      sections.push(
        checkboxFilter('infusionType', 'Infusion type', ['standard', 'replicate'], (value) =>
          value === 'standard' ? 'Standard' : 'Replicate Magic Item',
        ),
      )
    if (artificerItems) sections.push(...artificerItemFilters)
    const masteries = new Map<string, string>()
    for (const option of options) {
      for (const mastery of option.masteries ?? []) masteries.set(masteryKey(mastery), mastery.name)
    }
    if (masteries.size)
      sections.push(
        checkboxFilter(
          'mastery',
          'Mastery',
          [...masteries.keys()].sort((a, b) =>
            compare(masteries.get(a) ?? '', masteries.get(b) ?? ''),
          ),
          (value) => masteries.get(value) ?? value,
        ),
      )
    const unique = (values: string[]) => [...new Set(values)]
    const add = (
      key: string,
      label: string,
      values: string[],
      labelFor?: (value: string) => string,
      valueFor?: (value: string) => string,
      minimum = 2,
    ) => {
      if (values.length >= minimum)
        sections.push(checkboxFilter(key, label, values, labelFor, valueFor))
    }
    if (!artificerItems)
      add(
        'weaponCategory',
        'Weapon category',
        unique(options.flatMap((option) => option.weaponCategory ?? [])).sort(compare),
        (value) => value.charAt(0).toUpperCase() + value.slice(1),
      )
    add('weaponRange', 'Attack type', unique(options.flatMap((option) => option.weaponRange ?? [])))
    const summaries = options.flatMap((option) =>
      option.presentation?.kind === 'creature' ? [option.presentation.summary] : [],
    )
    add(
      'creatureSize',
      'Size',
      unique(summaries.flatMap((row) => row.sizes)).sort(compare),
      undefined,
      lower,
    )
    const ratings = new Map<string, number>()
    for (const row of summaries) {
      if (row.challenge) ratings.set(row.challenge, row.challengeValue ?? Infinity)
    }
    add(
      'creatureChallenge',
      'Challenge rating',
      [...ratings.keys()].sort(
        (a, b) => (ratings.get(a) ?? Infinity) - (ratings.get(b) ?? Infinity) || compare(a, b),
      ),
      (value) => `CR ${value}`,
    )
    add(
      'creatureMovement',
      'Special movement',
      unique(summaries.flatMap((row) => row.speedModes.filter((mode) => mode !== 'walk'))).sort(
        compare,
      ),
      titleCase,
      undefined,
      1,
    )
    add(
      'featureType',
      'Feature type',
      unique(
        options.flatMap((option) =>
          option.presentation?.kind === 'feature' ? option.presentation.featureTypeLabels : [],
        ),
      ).sort(compare),
    )
    if (hasUnmetPrerequisites) {
      sections.push({
        key: 'prerequisite',
        label: 'Prerequisites',
        type: 'switches',
        options: [
          {
            value: 'showUnmet',
            label: 'Show options with unmet or unverified prerequisites',
          },
        ],
      })
    }
    return sections
  }, [artificerItems, hasUnmetPrerequisites, infusions, options])
  const matchInvocationDraftItem = useCallback(
    (option: ClassChoiceOptionView, ids: ReadonlySet<string>, filters: ActiveFilters) =>
      (!option.invocationPrerequisite && !option.unavailableReason) ||
      filters.prerequisite?.has('showUnmet') ||
      initialSelectedIds.includes(getOptionSelectionKey(option)) ||
      ids.has(getOptionSelectionKey(option)) ||
      isClassChoiceOptionEligibleInDraft(option, ids),
    [initialSelectedIds],
  )
  const matchItem = useCallback(
    (option: ClassChoiceOptionView, search: string, activeFilters: ActiveFilters) => {
      const searchTarget = option.searchText ?? option.reference.name
      if (!searchTarget.toLowerCase().includes(search.trim().toLowerCase())) return false
      const creature =
        option.presentation?.kind === 'creature' ? option.presentation.summary : undefined
      if (
        !hasSelectedValue(
          activeFilters.infusionType,
          option.reference.entityType === 'item' ? 'replicate' : 'standard',
        ) ||
        !hasSelectedValue(activeFilters.itemType, option.itemFacets?.types) ||
        !hasSelectedValue(activeFilters.attunement, option.itemFacets?.attunement) ||
        !hasSelectedValue(activeFilters.weaponCategory, option.weaponCategory) ||
        !hasSelectedValue(activeFilters.weaponRange, option.weaponRange) ||
        !hasSelectedValue(activeFilters.creatureSize, creature?.sizes.map(lower)) ||
        !hasSelectedValue(activeFilters.creatureChallenge, creature?.challenge) ||
        !hasSelectedValue(
          activeFilters.creatureMovement,
          creature?.speedModes.filter((mode) => mode !== 'walk'),
        ) ||
        !hasSelectedValue(
          activeFilters.featureType,
          option.presentation?.kind === 'feature'
            ? option.presentation.featureTypeLabels
            : undefined,
        ) ||
        (activeFilters.mastery?.size &&
          !option.masteries?.some((mastery) => activeFilters.mastery.has(masteryKey(mastery))))
      )
        return false
      if (initialSelectedIds.includes(getOptionSelectionKey(option))) return true
      if (activeFilters.prerequisite?.has('showUnmet')) return true
      return prerequisiteByOptionKey.get(getOptionSelectionKey(option))?.met ?? true
    },
    [initialSelectedIds, prerequisiteByOptionKey],
  )
  const renderCard = useCallback(
    (
      option: ClassChoiceOptionView,
      selected: boolean,
      _canSelect: boolean,
      ids: ReadonlySet<string>,
    ) => {
      const live =
        !removalOnly && option.invocationPrerequisite
          ? {
              ...option,
              availability: isClassChoiceOptionEligibleInDraft(option, ids)
                ? ('eligible' as const)
                : ('retained' as const),
              unavailableReason: `Requires ${option.invocationPrerequisite.name} in this Invocation pool.`,
            }
          : option
      return (
        <ChoiceOptionCard
          option={live}
          selected={selected}
          removalOnly={removalOnly}
          prerequisite={
            prerequisiteByOptionKey.get(getOptionSelectionKey(option)) ?? {
              met: true,
              reasons: [],
            }
          }
        />
      )
    },
    [prerequisiteByOptionKey, removalOnly],
  )
  const canSelect = useCallback(
    (
      option: ClassChoiceOptionView,
      selectedIds: Set<string>,
      allOptions: ClassChoiceOptionView[],
    ) => {
      const key = getOptionSelectionKey(option)
      if (removalOnly) return initialSelectedIds.includes(key)
      if (!isClassChoiceOptionEligibleInDraft(option, selectedIds)) return false
      if (selectedIds.has(key)) return true
      if (!(prerequisiteByOptionKey.get(key)?.met ?? true)) return false
      if (invocationCantrips) {
        const repeat = getInvocationRepeatKey(option.reference)
        return (
          selectedIds.size < maximumSelections &&
          (!repeat ||
            !allOptions.some(
              (candidate) =>
                selectedIds.has(getOptionSelectionKey(candidate)) &&
                getInvocationRepeatKey(candidate.reference) === repeat,
            ))
        )
      }
      const eligibleSelectionCount = allOptions.filter(
        (candidate) =>
          isClassChoiceOptionEligible(candidate) &&
          selectedIds.has(getOptionSelectionKey(candidate)),
      ).length
      return (
        eligibleSelectionCount < maximumSelections &&
        !getDraftError?.(
          allOptions.filter(
            (candidate) =>
              candidate === option || selectedIds.has(getOptionSelectionKey(candidate)),
          ),
        )
      )
    },
    [
      maximumSelections,
      prerequisiteByOptionKey,
      removalOnly,
      initialSelectedIds,
      invocationCantrips,
      getDraftError,
    ],
  )

  if (enemySetup) return <FavoredEnemySetup {...enemySetup} onClose={onClose} />
  const onOpenChange = (open: boolean) => {
    if (!open) onClose()
  }
  if (
    historicalSetup &&
    !removalOnly &&
    (historicalSetup.alreadyProficient === undefined || editingHistory)
  )
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm {choice.owner?.featureName ?? choice.label} proficiency setup
            </DialogTitle>
            <DialogDescription>
              When you gained this feature, were you already proficient in{' '}
              {titleCase(historicalSetup.name)}
              {choice.proficiencyDomain === 'savingThrows' ? ' saving throws' : ''}?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {choice.proficiencyDomain === 'savingThrows'
              ? 'If you already had this proficiency, choose a saving throw you lack.'
              : "This answer determines whether you can choose a separate fallback skill. The feature's fixed proficiency and Expertise apply either way."}
          </p>
          <div className="flex flex-col gap-2">
            {[true, false].map((already) => (
              <Button
                key={String(already)}
                variant="outline"
                onClick={() => {
                  historicalSetup.onConfirm(already)
                  setEditingHistory(false)
                }}
              >
                {already ? 'Already proficient in' : 'Gained'} {titleCase(historicalSetup.name)}
                {choice.proficiencyDomain === 'savingThrows'
                  ? already
                    ? ' saving throws'
                    : ' saving throw proficiency'
                  : ''}
                {!already && ' from this feature'}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  return (
    <SelectionModal
      closeOnConfirm={false}
      open
      onOpenChange={onOpenChange}
      title={
        removalOnly
          ? `Review saved ${choice.label}`
          : choice.optionFilter?.requiresMastery
            ? `Choose weapons for ${choice.label}`
            : `Choose ${choice.label}`
      }
      items={options}
      getItemId={(option) => getOptionSelectionKey(option)}
      getItemLabel={getOptionLabel}
      renderCard={renderCard}
      matchItem={matchItem}
      matchDraftItem={
        !removalOnly &&
        options.some((option) => option.invocationPrerequisite || option.unavailableReason)
          ? matchInvocationDraftItem
          : undefined
      }
      filterSections={filterSections}
      categories={limits}
      selectionHint={
        historicalSetup && !removalOnly ? (
          <span>
            Acquisition setup:{' '}
            {historicalSetup.alreadyProficient
              ? 'already proficient'
              : 'gained proficiency from this feature'}
            .{' '}
            <button type="button" className="underline" onClick={() => setEditingHistory(true)}>
              Correct setup
            </button>
          </span>
        ) : removalOnly ? (
          'Keep or remove saved choices. Restore the source to choose a replacement.'
        ) : invocationCantrips ? (
          'Choose an eligible known Warlock cantrip for each targeted Invocation. Remove an existing choice to free its slot.'
        ) : choice.proficiencyDomain === 'expertise' &&
          classProficiencyRule(
            decodeClassProficiencyChoiceId(choice.id ?? '')?.target ?? '',
          )?.domains.some((domain) => domain.coupled) ? (
          <span>
            Choose up to {maximumSelections} skills. Each gains proficiency and Expertise.
          </span>
        ) : choice.proficiencyDomain === 'expertise' &&
          isOwnedExpertiseTarget(decodeClassProficiencyChoiceId(choice.id ?? '')?.target ?? '') ? (
          <span>
            Choose up to {maximumSelections} proficient option{maximumSelections === 1 ? '' : 's'}.
            {options.filter(isClassChoiceOptionEligible).length < maximumSelections && (
              <>
                {' '}
                <Link to="/build/proficiencies" className="underline" onClick={onClose}>
                  Choose proficiencies
                </Link>
              </>
            )}
          </span>
        ) : choice.kind === 'psionic' ? (
          'Intelligence is your psionic ability. Edit these choices to correct setup. These controls do not perform level-up replacements or spend psi points.'
        ) : undefined
      }
      getConfirmationError={(ids) => {
        if (retainsInvocationWithoutPrerequisite(options, new Set(initialSelectedIds), ids))
          return 'Remove the dependent Invocations before replacing their prerequisite.'
        return [...ids].some(
          (id) =>
            !options.some(
              (option) =>
                getOptionSelectionKey(option) === id &&
                (removalOnly ||
                  initialSelectedIds.includes(id) ||
                  isClassChoiceOptionEligibleInDraft(option, ids)),
            ),
        )
          ? 'Source rules changed. Close and review this choice before confirming.'
          : getDraftError?.(options.filter((option) => ids.has(getOptionSelectionKey(option))))
      }}
      canSelect={canSelect}
      initialSelectedIds={initialSelectedIds}
      onConfirm={(_ids, selected) => onConfirm(selected)}
    />
  )
}
