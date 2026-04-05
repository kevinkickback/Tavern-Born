import { Warning } from '@phosphor-icons/react';
import { memo, useCallback, useMemo } from 'react';
import {
  type ActiveFilters,
  type CategoryLimit,
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
  // Deduplicate by name (same feature may appear across multiple sources).
  const dedupedFeatures = useMemo(() => {
    const seen = new Map<string, OptionalFeatureOption>();
    for (const f of features) {
      if (!seen.has(f.name)) seen.set(f.name, f);
    }
    return Array.from(seen.values());
  }, [features]);

  // Run all prerequisite checks up-front so each card doesn't recompute.
  const prereqMap = useMemo(() => {
    const map = new Map<string, { met: boolean; reasons: string[] }>();
    for (const f of dedupedFeatures) {
      const result = checkAllPrerequisites(f, characterSnapshot, { className });
      map.set(f.name, { met: result.met, reasons: result.failures });
    }
    return map;
  }, [dedupedFeatures, characterSnapshot, className]);

  const categories: CategoryLimit<OptionalFeatureOption>[] = useMemo(
    () => [
      { key: 'all', label: 'selections', max: maxSelections, test: () => true },
    ],
    [maxSelections],
  );

  // Override SelectionModal's default guard: block if prereqs not met.
  const canSelect = useCallback(
    (
      item: OptionalFeatureOption,
      selectedIds: Set<string>,
      allItems: OptionalFeatureOption[],
    ) => {
      const prereq = prereqMap.get(item.name);
      if (prereq && !prereq.met) return false;
      // Also enforce the category limit (replaces defaultCanSelect).
      const selected = allItems.filter((i) => selectedIds.has(i.name)).length;
      if (selected >= maxSelections && !selectedIds.has(item.name))
        return false;
      return true;
    },
    [prereqMap, maxSelections],
  );

  const matchItem = useCallback(
    (item: OptionalFeatureOption, search: string, _filters: ActiveFilters) => {
      if (!search) return true;
      return item.name.toLowerCase().includes(search.toLowerCase());
    },
    [],
  );

  const renderCard = useCallback(
    (item: OptionalFeatureOption, isSelected: boolean) => {
      const prereq = prereqMap.get(item.name) ?? { met: true, reasons: [] };
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
      getItemId={(f) => f.name}
      renderCard={renderCard}
      matchItem={matchItem}
      categories={categories}
      canSelect={canSelect}
      initialSelectedIds={initialSelectedNames}
      onConfirm={(_ids, items) => onConfirm(items.map((f) => f.name))}
    />
  );
}
