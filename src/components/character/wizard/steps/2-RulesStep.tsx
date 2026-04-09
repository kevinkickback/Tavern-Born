import { BookOpen, Question, Sparkle, Warning } from '@phosphor-icons/react';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const bladesingerAnyRaceId = useId();
  const battleragerAnyRaceId = useId();
  const firearmsAllowedId = useId();
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

  const AS_METHODS = [
    {
      value: 'point-buy' as const,
      label: 'Point Buy',
      description:
        'Spend 27 points to customize your six ability scores. Each score starts at 8 and costs more as it gets higher, maxing at 15 before racial bonuses.',
    },
    {
      value: 'standard-array' as const,
      label: 'Standard Array',
      description:
        'Assign the fixed set of scores — 15, 14, 13, 12, 10, 8 — to your six abilities in any order you choose.',
    },
    {
      value: 'custom' as const,
      label: 'Custom',
      description:
        'Enter ability scores freely, such as values rolled with 4d6-drop-lowest. No restrictions are enforced.',
    },
  ];

  const VARIANT_RULE_DESCRIPTIONS: Record<string, string> = {
    optionalClassFeatures:
      "Unlocks Tasha's optional class features for your class, such as additional spells, feature replacements, and expanded options from TCE.",
    averageHitPoints:
      'When leveling up, you gain the average hit die value (rounded up) instead of rolling. Provides predictable HP growth.',
    bladesingerAnyRace:
      'By default Bladesinger (Wizard) is restricted to elves. Enable this to allow any race to take the Bladesinger subclass.',
    battleragerAnyRace:
      'By default Battlerager (Barbarian) is restricted to dwarves. Enable this to allow any race to take the Battlerager subclass.',
    firearmsAllowed:
      'Adds renaissance and futuristic firearms to the equipment list. These are optional rules from the DMG and setting books.',
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full gap-4">
        <div className="shrink-0 grid grid-cols-2 gap-6 w-full">
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Sparkle className="h-4 w-4 text-accent" weight="fill" />
              <h3 className="font-semibold">Ability Score Generation</h3>
            </div>

            <div className="flex rounded-lg overflow-hidden border border-border">
              {AS_METHODS.map(({ value, label }, i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ abilityScoreMethod: value })}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm font-semibold transition-all',
                    i > 0 && 'border-l border-border',
                    data.abilityScoreMethod === value
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-transparent hover:bg-accent/10',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed min-h-[2.5rem]">
              {AS_METHODS.find((m) => m.value === data.abilityScoreMethod)
                ?.description ?? ''}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-border">
              <Sparkle className="h-4 w-4 text-accent" weight="fill" />
              <h3 className="font-semibold">Variant Rules</h3>
            </div>

            <div className="columns-2 gap-x-6">
              {(
                [
                  {
                    id: optionalClassFeaturesId,
                    key: 'optionalClassFeatures' as const,
                    label: 'Optional Class Features',
                  },
                  {
                    id: averageHitPointsId,
                    key: 'averageHitPoints' as const,
                    label: 'Average Hit Points',
                  },
                  {
                    id: bladesingerAnyRaceId,
                    key: 'bladesingerAnyRace' as const,
                    label: 'Bladesinger Any Race',
                  },
                  {
                    id: battleragerAnyRaceId,
                    key: 'battleragerAnyRace' as const,
                    label: 'Battlerager Any Race',
                  },
                  {
                    id: firearmsAllowedId,
                    key: 'firearmsAllowed' as const,
                    label: 'Firearms Allowed',
                  },
                ] as const
              ).map(({ id, key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1.5 break-inside-avoid gap-2"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <Label htmlFor={id} className="text-sm cursor-pointer">
                      {label}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          aria-label={`Info: ${label}`}
                        >
                          <Question className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[220px] text-wrap"
                      >
                        {VARIANT_RULE_DESCRIPTIONS[key]}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch
                    id={id}
                    checked={data.variantRules?.[key] || false}
                    onCheckedChange={(checked) =>
                      onChange({
                        variantRules: { ...data.variantRules, [key]: checked },
                      })
                    }
                  />
                </div>
              ))}
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
                                data.allowedSources?.includes(
                                  source.abbreviation,
                                )
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
    </TooltipProvider>
  );
}
