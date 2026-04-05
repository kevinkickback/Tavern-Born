import { BookOpen, Sparkle, Warning } from '@phosphor-icons/react';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SourceBook } from '@/types/5etools';
import type { StepProps } from '../types';

interface RulesStepProps extends StepProps {
  gameData?: {
    sources?: SourceBook[];
  };
}

export function RulesStep({ data, onChange, gameData }: RulesStepProps) {
  const optionalClassFeaturesId = useId();
  const averageHitPointsId = useId();
  const sources = gameData?.sources || [];

  const sourcesByGroup = sources.reduce<Record<string, SourceBook[]>>(
    (acc, source) => {
      if (!acc[source.group]) {
        acc[source.group] = [];
      }
      acc[source.group].push(source);
      return acc;
    },
    {},
  );

  const groupLabels: Record<string, string> = {
    core: 'Core Rulebooks',
    supplement: 'Supplements',
    setting: 'Setting Books',
    adventure: 'Adventure Books',
    playtest: 'Playtest & Unofficial',
    other: 'Other Sources',
  };

  const groupOrder = [
    'core',
    'supplement',
    'setting',
    'adventure',
    'playtest',
    'other',
  ];

  const toggleSource = (sourceAbbr: string) => {
    const currentSources = data.allowedSources || [];
    if (currentSources.includes(sourceAbbr)) {
      onChange({
        allowedSources: currentSources.filter((s: string) => s !== sourceAbbr),
      });
    } else {
      onChange({ allowedSources: [...currentSources, sourceAbbr] });
    }
  };

  const selectAllSources = () => {
    onChange({ allowedSources: sources.map((s) => s.abbreviation) });
  };

  const selectRecommendedSources = () => {
    const recommendedAbbrs = new Set([
      'PHB',
      'DMG',
      'MM',
      'XGE',
      'TCE',
      'VGM',
      'MTF',
      'SCAG',
      'ERLW',
      'EGW',
    ]);
    const recommended = sources
      .filter((s) => recommendedAbbrs.has(s.abbreviation))
      .map((s) => s.abbreviation);
    onChange({ allowedSources: recommended });
  };

  const selectNoneSources = () => {
    onChange({ allowedSources: [] });
  };

  const _selectGroupSources = (group: string) => {
    const currentSources = data.allowedSources || [];
    const groupSources =
      sourcesByGroup[group]?.map((s) => s.abbreviation) || [];
    const allSelected = groupSources.every((abbr: string) =>
      currentSources.includes(abbr),
    );

    if (allSelected) {
      onChange({
        allowedSources: currentSources.filter(
          (s: string) => !groupSources.includes(s),
        ),
      });
    } else {
      const newSources = [...new Set([...currentSources, ...groupSources])];
      onChange({ allowedSources: newSources });
    }
  };

  const _isGroupSelected = (group: string) => {
    const currentSources = data.allowedSources || [];
    const groupSources =
      sourcesByGroup[group]?.map((s) => s.abbreviation) || [];
    return (
      groupSources.length > 0 &&
      groupSources.every((abbr: string) => currentSources.includes(abbr))
    );
  };

  const isPhbRequired = () => {
    const phbSources = sources.filter(
      (s) => s.abbreviation === 'PHB' || s.abbreviation === 'XPHB',
    );
    return !phbSources.some((s) =>
      data.allowedSources?.includes(s.abbreviation),
    );
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 grid grid-cols-2 gap-6 max-w-2xl mx-auto w-full">
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <Sparkle className="h-4 w-4 text-accent" weight="fill" />
            <h3 className="font-semibold">Ability Score Generation</h3>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onChange({ abilityScoreMethod: 'point-buy' })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border-2 text-left transition-all text-sm',
                data.abilityScoreMethod === 'point-buy'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50',
              )}
            >
              <div className="font-semibold">Point Buy</div>
            </button>

            <button
              type="button"
              onClick={() => onChange({ abilityScoreMethod: 'standard-array' })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border-2 text-left transition-all text-sm',
                data.abilityScoreMethod === 'standard-array'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50',
              )}
            >
              <div className="font-semibold">Standard Array</div>
            </button>

            <button
              type="button"
              onClick={() => onChange({ abilityScoreMethod: 'custom' })}
              className={cn(
                'w-full px-3 py-2 rounded-lg border-2 text-left transition-all text-sm',
                data.abilityScoreMethod === 'custom'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50',
              )}
            >
              <div className="font-semibold">Custom</div>
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <Sparkle className="h-4 w-4 text-accent" weight="fill" />
            <h3 className="font-semibold">Variant Rules</h3>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between py-1.5">
              <Label
                htmlFor={optionalClassFeaturesId}
                className="text-sm cursor-pointer"
              >
                Optional Class Features
              </Label>
              <Switch
                id={optionalClassFeaturesId}
                checked={data.variantRules?.optionalClassFeatures || false}
                onCheckedChange={(checked) =>
                  onChange({
                    variantRules: {
                      ...data.variantRules,
                      optionalClassFeatures: checked,
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between py-1.5">
              <Label
                htmlFor={averageHitPointsId}
                className="text-sm cursor-pointer"
              >
                Average Hit Points
              </Label>
              <Switch
                id={averageHitPointsId}
                checked={data.variantRules?.averageHitPoints || false}
                onCheckedChange={(checked) =>
                  onChange({
                    variantRules: {
                      ...data.variantRules,
                      averageHitPoints: checked,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" weight="fill" />
            <h4 className="font-semibold text-lg">Allowed Sources</h4>
            {(data.allowedSources?.length ?? 0) > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-semibold px-2 py-0.5 min-w-[1.5rem]">
                {data.allowedSources?.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={selectAllSources}
              className="text-accent hover:underline font-medium"
            >
              Select All
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={selectRecommendedSources}
              className="text-accent hover:underline font-medium"
            >
              Recommended
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={selectNoneSources}
              className="text-accent hover:underline font-medium"
            >
              None
            </button>
          </div>
        </div>

        {sources.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-border rounded-lg">
            No sources available. Please load game data in Settings first.
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {groupOrder.map((group) => {
                const groupSources = sourcesByGroup[group];
                if (!groupSources || groupSources.length === 0) return null;

                return (
                  <div key={group} className="space-y-1.5">
                    <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {groupLabels[group]}
                    </h5>
                    <div className="grid grid-cols-2 gap-2">
                      {groupSources.map((source) => (
                        <button
                          type="button"
                          key={source.abbreviation}
                          onClick={() => toggleSource(source.abbreviation)}
                          className={cn(
                            'px-3 py-2.5 rounded-md border text-left transition-all text-sm flex items-start gap-2',
                            data.allowedSources?.includes(source.abbreviation)
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <BookOpen
                            className={cn(
                              'h-4 w-4 flex-shrink-0 mt-0.5',
                              data.allowedSources?.includes(source.abbreviation)
                                ? 'text-accent'
                                : 'text-muted-foreground',
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">
                              {source.name}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {source.abbreviation}
                              {source.year && ` (${source.year})`}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {isPhbRequired() && (
              <div className="text-xs text-destructive flex items-center gap-1.5 flex-shrink-0 bg-destructive/10 border border-destructive/30 p-3 rounded-md">
                <Warning className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  At least one Player's Handbook (2014 or 2024) is required.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
