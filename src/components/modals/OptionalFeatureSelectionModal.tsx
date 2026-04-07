import { Warning } from '@phosphor-icons/react';
import { memo, useCallback, useMemo } from 'react';
import {
  type ActiveFilters,
  type CategoryLimit,
  type FilterSection,
  SelectionModal,
} from '@/components/modals/SelectionModal';
import { Badge } from '@/components/ui/badge';
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites';
import { renderEntry } from '@/lib/renderer';
import { cn } from '@/lib/utils';

const _entryCache = new WeakMap<object, string>();
function cachedEntry(entry: unknown): string {
  if (!entry) return '';
  if (typeof entry !== 'object') return renderEntry(entry);
  const hit = _entryCache.get(entry as object);
  if (hit !== undefined) return hit;
  const html = renderEntry(entry);
  _entryCache.set(entry as object, html);
  return html;
}

type OptionalFeatureOption = {
  name: string;
  source?: string;
  entries?: unknown[];
  [extra: string]: unknown;
};

export interface OptionalFeatureSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. "Choose Eldritch Invocations" */
  title: string;
  /** Pre-filtered list of optional feature objects for this featureType. */
  features: OptionalFeatureOption[];
  /** Maximum allowed selections (total at current class level). */
  maxSelections: number;
  /** Feature names already chosen when the dialog opens. */
  initialSelectedNames?: string[];
  /** Character snapshot used for prerequisite validation. */
  characterSnapshot: PrereqCharacterSnapshot;
  /** Class name for level-based prereq checks (e.g. "Warlock"). */
  className?: string;
  onConfirm: (names: string[]) => void;
}

interface FeatureCardProps {
  feature: OptionalFeatureOption;
  isSelected: boolean;
  prereqMet: boolean;
  prereqReasons: string[];
}

const FeatureCard = memo(function FeatureCard({
  feature,
  isSelected,
  prereqMet,
  prereqReasons,
}: FeatureCardProps) {
  const firstEntry = feature.entries?.[0];
  const descHtml = firstEntry ? cachedEntry(firstEntry) : '';

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
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 h-5 text-muted-foreground"
            >
              {feature.source}
            </Badge>
          )}
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">
              ✓
            </Badge>
          )}
        </div>
      </div>
      {!prereqMet && prereqReasons.length > 0 && (
        <div className="flex items-start gap-1.5 mb-1.5 px-2 py-1.5 rounded bg-warning/10 border border-warning/20">
          <Warning
            className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5"
            weight="fill"
          />
          <div className="text-xs text-warning/90 leading-snug">
            {prereqReasons.join(' · ')}
          </div>
        </div>
      )}
      {descHtml && (
        <div
          className={cn(
            'text-[13px] text-muted-foreground line-clamp-3 leading-snug',
            !prereqMet && !isSelected && 'opacity-70',
          )}
          // renderEntry returns safe HTML from structured 5etools data.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      )}
    </div>
  );
});

/** Derive a stable composite key for a feature that respects source. */
function featureKey(f: OptionalFeatureOption): string {
  return `${f.name}|${f.source ?? ''}`;
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
  // Deduplicate by name|source composite key.
  const dedupedFeatures = useMemo(() => {
    const seen = new Map<string, OptionalFeatureOption>();
    for (const f of features) {
      const key = featureKey(f);
      if (!seen.has(key)) seen.set(key, f);
    }
    return Array.from(seen.values());
  }, [features]);

  // Map incoming bare names → composite keys for SelectionModal's initialSelectedIds.
  // When a stored name matches exactly one dedupedFeature, use its composite key.
  const initialSelectedIds = useMemo(() => {
    return initialSelectedNames.map((name) => {
      const match = dedupedFeatures.find((f) => f.name === name);
      return match ? featureKey(match) : `${name}|`;
    });
  }, [initialSelectedNames, dedupedFeatures]);

  // Run all prerequisite checks up-front so each card doesn't recompute.
  const prereqMap = useMemo(() => {
    const map = new Map<string, { met: boolean; reasons: string[] }>();
    for (const f of dedupedFeatures) {
      const result = checkAllPrerequisites(f, characterSnapshot, { className });
      map.set(featureKey(f), { met: result.met, reasons: result.failures });
    }
    return map;
  }, [dedupedFeatures, characterSnapshot, className]);

  const hasUnmetPrerequisites = useMemo(
    () => [...prereqMap.values()].some((p) => !p.met),
    [prereqMap],
  );

  const categories: CategoryLimit<OptionalFeatureOption>[] = useMemo(
    () => [
      { key: 'all', label: 'selections', max: maxSelections, test: () => true },
    ],
    [maxSelections],
  );

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
  );

  // Override SelectionModal's default guard: block if prereqs not met.
  const canSelect = useCallback(
    (
      item: OptionalFeatureOption,
      selectedIds: Set<string>,
      allItems: OptionalFeatureOption[],
    ) => {
      const prereq = prereqMap.get(featureKey(item));
      if (prereq && !prereq.met) return false;
      // Also enforce the category limit (replaces defaultCanSelect).
      const selected = allItems.filter((i) =>
        selectedIds.has(featureKey(i)),
      ).length;
      if (selected >= maxSelections && !selectedIds.has(featureKey(item)))
        return false;
      return true;
    },
    [prereqMap, maxSelections],
  );

  const matchItem = useCallback(
    (
      item: OptionalFeatureOption,
      search: string,
      activeFilters: ActiveFilters,
    ) => {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      const showUnmet = activeFilters.prereq?.has('showUnmet') ?? false;
      if (!showUnmet) {
        const prereq = prereqMap.get(featureKey(item));
        if (prereq && !prereq.met) return false;
      }
      return true;
    },
    [prereqMap],
  );

  const renderCard = useCallback(
    (item: OptionalFeatureOption, isSelected: boolean) => {
      const prereq = prereqMap.get(featureKey(item)) ?? {
        met: true,
        reasons: [],
      };
      return (
        <FeatureCard
          feature={item}
          isSelected={isSelected}
          prereqMet={prereq.met}
          prereqReasons={prereq.reasons}
        />
      );
    },
    [prereqMap],
  );

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
  );
}
