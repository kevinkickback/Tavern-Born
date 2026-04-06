import { CaretRight, Check, Star } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  getSubclassFeatureGroups,
  resolveSubclassFeatureRefs,
} from '@/lib/5etools/classData';
import { cn } from '@/lib/utils';
import type { Class5e, Subclass5e } from '@/types/5etools';
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel';

interface BuildClassSubclassSectionProps {
  level: number;
  subclassFeatureName: string | null;
  featuresByLevel: Map<number, ClassFeatureDisplay[]>;
  viewingClassData?: Class5e;
  viewingSubclass?: string;
  viewingSubclassData?: Subclass5e;
  selectedFeature: SelectedFeatureState | null;
  detailCollapsed: boolean;
  onSelectFeature: (feature: SelectedFeatureState) => void;
  onExpandDetails: () => void;
  onOpenSubclassPicker: () => void;
}

export function BuildClassSubclassSection({
  level,
  subclassFeatureName,
  featuresByLevel,
  viewingClassData,
  viewingSubclass,
  viewingSubclassData,
  selectedFeature,
  detailCollapsed,
  onSelectFeature,
  onExpandDetails,
  onOpenSubclassPicker,
}: BuildClassSubclassSectionProps) {
  const subclassFeature = subclassFeatureName
    ? (featuresByLevel.get(level) ?? []).find(
        (feature) => feature.name === subclassFeatureName,
      )
    : undefined;

  const title =
    (viewingClassData as { subclassTitle?: string })?.subclassTitle ??
    'Subclass';

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        viewingSubclass
          ? 'border-success/30 bg-success/5'
          : 'border-warning/30 bg-warning/5',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 min-w-0 text-left transition-colors hover:text-accent group',
            subclassFeature &&
              selectedFeature?.name === subclassFeature.name &&
              'text-accent',
          )}
          onClick={() => {
            if (!subclassFeature) return;
            onSelectFeature({
              name: subclassFeature.name,
              source: subclassFeature.source,
              entries: resolveSubclassFeatureRefs(
                subclassFeature.entries ?? [],
                viewingSubclassData?.shortName,
              ),
            });
            if (detailCollapsed) onExpandDetails();
          }}
        >
          <Star
            className="h-4 w-4 text-accent flex-shrink-0"
            weight="duotone"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {title}
              {viewingSubclass && (
                <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
              )}
            </div>
            {!viewingSubclass && (
              <div className="text-xs text-muted-foreground">None selected</div>
            )}
          </div>
          {subclassFeature && (subclassFeature.entries ?? []).length > 0 && (
            <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
          )}
        </button>
        <Button
          variant={viewingSubclass ? 'outline' : 'default'}
          size="sm"
          className="flex-shrink-0 ml-2 h-7 text-xs"
          onClick={onOpenSubclassPicker}
        >
          {viewingSubclass ? 'Change' : 'Choose'}
        </Button>
      </div>
      {viewingSubclass && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          <button
            type="button"
            onMouseEnter={() => {
              onSelectFeature({
                name: viewingSubclass,
                source: viewingSubclassData?.source,
                entries: resolveSubclassFeatureRefs(
                  viewingSubclassData?.entries ?? [],
                  viewingSubclassData?.shortName,
                ),
                levelFeatures: getSubclassFeatureGroups(viewingSubclassData),
              });
              if (detailCollapsed) onExpandDetails();
            }}
            onClick={() =>
              onSelectFeature({
                name: viewingSubclass,
                source: viewingSubclassData?.source,
                entries: resolveSubclassFeatureRefs(
                  viewingSubclassData?.entries ?? [],
                  viewingSubclassData?.shortName,
                ),
                levelFeatures: getSubclassFeatureGroups(viewingSubclassData),
              })
            }
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
          >
            <span className="font-medium">{viewingSubclass}</span>
          </button>
        </div>
      )}
    </div>
  );
}
