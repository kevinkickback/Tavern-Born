import { Warning } from '@phosphor-icons/react'
import { memo, useCallback, useMemo } from 'react'
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
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Raw5ePrereq } from '@/types/5etools'

type OptionalFeatureOption = {
  name: string
  source?: string
  entries?: unknown[]
  prerequisite?: Raw5ePrereq[]
  [extra: string]: unknown
}

export interface OptionalFeatureSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  features: OptionalFeatureOption[]
  maxSelections: number
  initialSelectedNames?: string[]
  characterSnapshot: PrereqCharacterSnapshot
  className?: string
  onConfirm: (names: string[]) => void
}

interface FeatureCardProps {
  feature: OptionalFeatureOption
  isSelected: boolean
  prereqMet: boolean
  prereqReasons: string[]
}

const FeatureCard = memo(function FeatureCard({
  feature,
  isSelected,
  prereqMet,
  prereqReasons,
}: FeatureCardProps) {
  const firstEntry = feature.entries?.[0]
  const descHtml = firstEntry ? renderEntryCached(firstEntry) : ''

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span
          className={cn(
            'font-semibold text-base leading-tight',
            !prereqMet && !isSelected && 'text-muted-foreground',
          )}
        >
          {feature.name}
        </span>
        <div className="flex gap-1 flex-shrink-0">
          {feature.source && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {feature.source}
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
          <div className="text-xs text-warning/90 leading-snug">{prereqReasons.join(' · ')}</div>
        </div>
      )}
      {descHtml && (
        <div
          className={cn(
            'text-sm text-muted-foreground line-clamp-3 leading-snug',
            !prereqMet && !isSelected && 'opacity-70',
          )}
          // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      )}
    </div>
  )
})

function featureKey(f: OptionalFeatureOption): string {
  return `${f.name}|${f.source ?? ''}`
}

export function OptionalFeatureSelectionModal({
  open,
  onOpenChange,
  title,
  features,
  maxSelections,
  initialSelectedNames = [],
  characterSnapshot,
  className,
  onConfirm,
}: OptionalFeatureSelectionModalProps) {
  const dedupedFeatures = useMemo(() => {
    const seen = new Map<string, OptionalFeatureOption>()
    for (const f of features) {
      const key = featureKey(f)
      if (!seen.has(key)) seen.set(key, f)
    }
    return Array.from(seen.values())
  }, [features])

  const initialSelectedIds = useMemo(() => {
    return initialSelectedNames.map((name) => {
      const match = dedupedFeatures.find((f) => f.name === name)
      return match ? featureKey(match) : `${name}|`
    })
  }, [initialSelectedNames, dedupedFeatures])

  const prereqMap = useMemo(() => {
    const map = new Map<string, { met: boolean; reasons: string[] }>()
    for (const f of dedupedFeatures) {
      const result = checkAllPrerequisites(f, characterSnapshot, { className })
      map.set(featureKey(f), { met: result.met, reasons: result.failures })
    }
    return map
  }, [dedupedFeatures, characterSnapshot, className])

  const hasUnmetPrerequisites = useMemo(
    () => [...prereqMap.values()].some((p) => !p.met),
    [prereqMap],
  )

  const categories: CategoryLimit<OptionalFeatureOption>[] = useMemo(
    () => [{ key: 'all', label: 'selections', max: maxSelections, test: () => true }],
    [maxSelections],
  )

  const filterSections: FilterSection[] = useMemo(
    () =>
      hasUnmetPrerequisites
        ? [
            {
              key: 'prereq',
              label: 'Prerequisites',
              type: 'switches',
              options: [
                {
                  value: 'showUnmet',
                  label: 'Show options with unmet prerequisites',
                },
              ],
            },
          ]
        : [],
    [hasUnmetPrerequisites],
  )

  const canSelect = useCallback(
    (item: OptionalFeatureOption, selectedIds: Set<string>, allItems: OptionalFeatureOption[]) => {
      const prereq = prereqMap.get(featureKey(item))
      if (prereq && !prereq.met) return false
      const selected = allItems.filter((i) => selectedIds.has(featureKey(i))).length
      if (selected >= maxSelections && !selectedIds.has(featureKey(item))) return false
      return true
    },
    [prereqMap, maxSelections],
  )

  const matchItem = useCallback(
    (item: OptionalFeatureOption, search: string, activeFilters: ActiveFilters) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      const showUnmet = activeFilters.prereq?.has('showUnmet') ?? false
      if (!showUnmet) {
        const prereq = prereqMap.get(featureKey(item))
        if (prereq && !prereq.met) return false
      }
      return true
    },
    [prereqMap],
  )

  const renderCard = useCallback(
    (item: OptionalFeatureOption, isSelected: boolean) => {
      const prereq = prereqMap.get(featureKey(item)) ?? {
        met: true,
        reasons: [],
      }
      return (
        <FeatureCard
          feature={item}
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
      title={title}
      items={dedupedFeatures}
      getItemId={featureKey}
      renderCard={renderCard}
      matchItem={matchItem}
      filterSections={filterSections}
      categories={categories}
      canSelect={canSelect}
      initialSelectedIds={initialSelectedIds}
      onConfirm={(_ids, items) => onConfirm(items.map((f) => f.name))}
    />
  )
}
