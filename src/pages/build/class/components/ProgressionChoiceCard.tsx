import { Check, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SelectedFeatureState } from './DetailsPanel';

interface ChosenItem {
  name: string;
  source?: string;
  entries?: unknown[];
}

interface ProgressionChoiceCardProps {
  id: string;
  label: string;
  selectedCount: number;
  totalAllowed: number;
  isFull: boolean;
  chosenItems: ChosenItem[];
  detailCollapsed: boolean;
  onChoose: () => void;
  onSelectFeature: (feature: SelectedFeatureState) => void;
  onExpandDetails: () => void;
}

export function BuildClassProgressionChoiceCard({
  id,
  label,
  selectedCount,
  totalAllowed,
  isFull,
  chosenItems,
  detailCollapsed,
  onChoose,
  onSelectFeature,
  onExpandDetails,
}: ProgressionChoiceCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        isFull
          ? 'border-success/30 bg-success/5'
          : 'border-warning/30 bg-warning/5',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkle
            className="h-4 w-4 text-accent flex-shrink-0"
            weight="duotone"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {label}
              {isFull && (
                <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedCount} / {totalAllowed} chosen
            </div>
          </div>
        </div>
        <Button
          variant={selectedCount > 0 ? 'outline' : 'default'}
          size="sm"
          className="flex-shrink-0 ml-2 h-7 text-xs"
          onClick={onChoose}
        >
          {selectedCount > 0 ? 'Edit' : 'Choose'}
        </Button>
      </div>

      {chosenItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          {chosenItems.map((item) => (
            <button
              key={`${id}|${item.name}|${item.source ?? ''}`}
              type="button"
              onMouseEnter={() => {
                onSelectFeature({
                  name: item.name,
                  source: item.source,
                  entries: item.entries ?? [],
                });
                if (detailCollapsed) onExpandDetails();
              }}
              onClick={() => {
                onSelectFeature({
                  name: item.name,
                  source: item.source,
                  entries: item.entries ?? [],
                });
                if (detailCollapsed) onExpandDetails();
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
            >
              <span className="font-medium">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
