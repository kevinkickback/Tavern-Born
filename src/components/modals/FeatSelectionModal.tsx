import { Warning } from '@phosphor-icons/react'
import { memo, useCallback, useMemo } from 'react'
import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { featCategoryToFull } from '@/lib/5etools/classData'
import { extractUniqueFeatCategories } from '@/lib/5etools/filters'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'
import type { Feat5e } from '@/types/5etools'

interface FeatCardProps {
  feat: Feat5e
  isSelected: boolean
  prereqMet: boolean
  prereqReasons: string[]
  recursiveLookup: RecursiveLookup
}

const FeatCard = memo(function FeatCard({
  feat,
  isSelected,
  prereqMet,
  prereqReasons,
  recursiveLookup,
}: FeatCardProps) {
  const descriptionEntries = feat.entries ?? []
  const categoryLabel =
    typeof feat.category === 'string' && feat.category.length > 0
      ? featCategoryToFull(feat.category)
      : null

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span
          className={cn(
            'font-semibold text-sm leading-tight',
            !prereqMet && !isSelected && 'text-muted-foreground',
          )}
        >
          {feat.name}
        </span>
        <div className="flex gap-1 flex-shrink-0">
          {feat.source && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {feat.source}
            </Badge>
          )}
          {categoryLabel && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {categoryLabel}
            </Badge>
          )}
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">✓</Badge>
          )}
        </div>
      </div>

      {!prereqMet && prereqReasons.length > 0 && (
        <div className="flex items-start gap-1.5 mb-1.5 px-2 py-1.5 rounded bg-warning/10 border border-warning/20">
          <Warning className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5" weight="fill" />
          <p className="text-xs text-warning/90 leading-snug">{prereqReasons.join(' · ')}</p>
        </div>
      )}

      {descriptionEntries.length > 0 && (
        <RenderedEntryWithTooltip
          entry={descriptionEntries}
          className={cn(
            'text-sm text-muted-foreground line-clamp-5 leading-snug',
            !prereqMet && !isSelected && 'opacity-70',
          )}
          recursiveLookup={recursiveLookup}
        />
      )}
    </div>
  )
})

export interface FeatSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feats: Feat5e[]
  maxSelections: number
  initialSelectedIds?: string[]
  characterSnapshot: PrereqCharacterSnapshot
  initialFilters?: ActiveFilters
  swapOnLimit?: boolean
  onConfirm: (selectedFeats: Feat5e[]) => void
}

export function FeatSelectionModal({
  open,
  onOpenChange,
  feats,
  maxSelections,
  initialSelectedIds = [],
  characterSnapshot,
  initialFilters,
  swapOnLimit = true,
  onConfirm,
}: FeatSelectionModalProps) {
  const recursiveLookup = useRecursiveLookup()

  const featCategoryOptions = useMemo(() => {
    return extractUniqueFeatCategories(feats)
      .map((code) => ({
        value: code,
        label: featCategoryToFull(code),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [feats])

  const { prereqMap, hasUnmetPrerequisites } = useMemo(() => {
    const map = new Map<string, { met: boolean; reasons: string[] }>()
    let hasUnmet = false
    for (const f of feats) {
      const result = checkAllPrerequisites(f, characterSnapshot)
      map.set(`${f.name}|${f.source ?? ''}`, {
        met: result.met,
        reasons: result.failures,
      })
      if (!result.met) hasUnmet = true
    }
    return { prereqMap: map, hasUnmetPrerequisites: hasUnmet }
  }, [feats, characterSnapshot])

  const filterSections: FilterSection[] = useMemo(
    () => [
      ...(featCategoryOptions.length > 1
        ? [
            {
              key: 'featCategory',
              label: 'Categories',
              type: 'checkboxes' as const,
              options: featCategoryOptions,
              columns: 1 as const,
            },
          ]
        : []),
      ...(hasUnmetPrerequisites
        ? [
            {
              key: 'prereq',
              label: 'Prerequisites',
              type: 'switches' as const,
              options: [
                {
                  value: 'showUnmet',
                  label: 'Show feats with unmet prerequisites',
                },
              ],
            },
          ]
        : []),
    ],
    [featCategoryOptions, hasUnmetPrerequisites],
  )

  const categories: CategoryLimit<Feat5e>[] = useMemo(
    () => [
      {
        key: 'all',
        label: maxSelections === 1 ? 'feat' : 'feats',
        max: maxSelections,
        test: () => true,
      },
    ],
    [maxSelections],
  )

  const matchItem = useCallback(
    (item: Feat5e, search: string, activeFilters: ActiveFilters) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
      const selectedCategories = activeFilters.featCategory
      if (selectedCategories && selectedCategories.size > 0) {
        if (!item.category || !selectedCategories.has(item.category)) {
          return false
        }
      }
      const showUnmet = activeFilters.prereq?.has('showUnmet') ?? false
      if (!showUnmet) {
        const prereq = prereqMap.get(`${item.name}|${item.source ?? ''}`)
        if (prereq && !prereq.met) return false
      }
      return true
    },
    [prereqMap],
  )

  const renderCard = useCallback(
    (item: Feat5e, isSelected: boolean) => {
      const prereq = prereqMap.get(`${item.name}|${item.source ?? ''}`) ?? {
        met: true,
        reasons: [],
      }
      return (
        <FeatCard
          feat={item}
          isSelected={isSelected}
          prereqMet={prereq.met}
          prereqReasons={prereq.reasons}
          recursiveLookup={recursiveLookup}
        />
      )
    },
    [prereqMap, recursiveLookup],
  )

  return (
    <SelectionModal
      open={open}
      onOpenChange={onOpenChange}
      title="Select Feats"
      items={feats}
      getItemId={(f) => `${f.name}|${f.source ?? ''}`}
      renderCard={renderCard}
      matchItem={matchItem}
      filterSections={filterSections}
      categories={categories}
      swapOnLimit={swapOnLimit}
      initialSelectedIds={initialSelectedIds}
      initialFilters={initialFilters}
      onConfirm={(_ids, items) => onConfirm(items)}
    />
  )
}
