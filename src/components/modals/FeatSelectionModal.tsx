import { Warning } from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useRef } from 'react'
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { featCategoryToFull } from '@/lib/5etools/classData'
import { extractUniqueFeatCategories } from '@/lib/5etools/filters'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Feat5e } from '@/types/5etools'

interface FeatCardProps {
  feat: Feat5e
  isSelected: boolean
  prereqMet: boolean
  prereqReasons: string[]
}

const FeatCard = memo(function FeatCard({
  feat,
  isSelected,
  prereqMet,
  prereqReasons,
}: FeatCardProps) {
  const firstEntry = feat.entries?.[0]
  const descHtml = firstEntry ? renderEntryCached(firstEntry) : ''
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

      {descHtml && (
        <div
          className={cn(
            'text-[13px] text-muted-foreground line-clamp-3 leading-snug',
            !prereqMet && !isSelected && 'opacity-70',
          )}
          // renderEntry outputs safe HTML from structured 5etools entries.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      )}
    </div>
  )
})

export interface FeatSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Available feats to browse (pre-filtered to allowed sources, merged with saved feats). */
  feats: Feat5e[]
  /** How many feats the character may hold (total earned ASI slots, excluding special feats). */
  maxSelections: number
  /** Composite IDs (`name|source`) pre-selected when the dialog opens. */
  initialSelectedIds?: string[]
  /** IDs of feats that were selected via the ignore-limit toggle (count excluded from limit). */
  initialSpecialIds?: string[]
  /** Character snapshot used for prerequisite validation. */
  characterSnapshot: PrereqCharacterSnapshot
  /** Optional initial filter state when opening (e.g. show unmet prereqs in class-driven pickers). */
  initialFilters?: ActiveFilters
  /** When false, hides the "Ignore selection limit" switch (e.g. on BuildClassPage). Defaults to true. */
  allowIgnoreLimit?: boolean
  onConfirm: (selectedFeats: Feat5e[]) => void
}

export function FeatSelectionModal({
  open,
  onOpenChange,
  feats,
  maxSelections,
  initialSelectedIds = [],
  initialSpecialIds = [],
  characterSnapshot,
  initialFilters,
  allowIgnoreLimit = true,
  onConfirm,
}: FeatSelectionModalProps) {
  const featCategoryOptions = useMemo(() => {
    return extractUniqueFeatCategories(feats)
      .map((code) => ({
        value: code,
        label: featCategoryToFull(code),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [feats])

  // Build prereq map once; keyed by `name|source`
  const prereqMap = useMemo(() => {
    const map = new Map<string, { met: boolean; reasons: string[] }>()
    for (const f of feats) {
      const result = checkAllPrerequisites(f, characterSnapshot)
      map.set(`${f.name}|${f.source ?? ''}`, {
        met: result.met,
        reasons: result.failures,
      })
    }
    return map
  }, [feats, characterSnapshot])

  const hasUnmetPrerequisites = useMemo(
    () => [...prereqMap.values()].some((p) => !p.met),
    [prereqMap],
  )

  // Tracks whether the "ignore selection limit" switch is active.
  // Updated inside matchItem (which receives activeFilters) and read by canSelect.
  const ignoreLimitRef = useRef(false)
  // IDs of feats that are already classified as "special" — excluded from the normal slot count.
  const specialIdsRef = useRef(new Set(initialSpecialIds))

  const filterSections: FilterSection[] = useMemo(
    () => [
      ...(allowIgnoreLimit
        ? [
            {
              key: 'limit',
              label: 'Options',
              type: 'switches' as const,
              options: [{ value: 'ignoreLimit', label: 'Ignore selection limit' }],
            },
          ]
        : []),
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
    [allowIgnoreLimit, featCategoryOptions, hasUnmetPrerequisites],
  )

  const categories: CategoryLimit<Feat5e>[] = useMemo(
    () => [
      {
        key: 'all',
        label: maxSelections === 1 ? 'feat' : 'feats',
        // Include pre-existing special feats in the display limit so the badge
        // doesn't appear red when special feats are pre-selected.
        max: maxSelections + specialIdsRef.current.size,
        test: () => true,
      },
    ],
    // `specialIdsRef.current` is mutable by design; depending on it would cause noisy recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxSelections],
  )

  // Feats with unmet prereqs are hidden by default; the filter toggle reveals them.
  // They remain selectable when visible — prereq failures are shown as warnings only.
  // Also captures the ignoreLimit switch state into ignoreLimitRef for canSelect.
  const matchItem = useCallback(
    (item: Feat5e, search: string, activeFilters: ActiveFilters) => {
      ignoreLimitRef.current = activeFilters.limit?.has('ignoreLimit') ?? false
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

  // When the selection limit is ignored, all items are always selectable.
  // Otherwise, block adding beyond maxSelections — special IDs don't count against the limit.
  const canSelect = useCallback(
    (item: Feat5e, selectedIds: Set<string>, _allItems: Feat5e[]) => {
      if (ignoreLimitRef.current) return true
      const id = `${item.name}|${item.source ?? ''}`
      if (selectedIds.has(id)) return true
      const normalCount = [...selectedIds].filter((sid) => !specialIdsRef.current.has(sid)).length
      return normalCount < maxSelections
    },
    [maxSelections],
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
        />
      )
    },
    [prereqMap],
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
      canSelect={canSelect}
      initialSelectedIds={initialSelectedIds}
      initialFilters={initialFilters}
      onConfirm={(_ids, items) => onConfirm(items)}
    />
  )
}
