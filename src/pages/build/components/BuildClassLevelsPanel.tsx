import {
  CaretRight,
  Check,
  MagicWand,
  Sparkle,
  Star,
  Sword,
} from '@phosphor-icons/react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  featCategoryToFull,
  getOptFeatureTotal,
  getSubclassFeatureGroups,
  type OptionalFeatureLike,
  optFeatureTypeToFull,
  resolveSubclassFeatureRefs,
} from '@/lib/5etools/classData';
import { formatSpellLevel } from '@/lib/calculations/spellUtils';
import { cn } from '@/lib/utils';
import type { Class5e, Feat5e, Spell5e, Subclass5e } from '@/types/5etools';
import type {
  AsiChoice,
  Character,
  CharacterClassEntry,
} from '@/types/character';
import type {
  ClassFeatureDisplay,
  SelectedFeatureState,
} from './BuildClassDetailsPanel';

interface ClassFeatProgression {
  name?: string;
  category: string[];
  progression: number[] | Record<string, number>;
}

interface BuildClassLevelsPanelProps {
  classProgression: CharacterClassEntry[];
  selectedClassTab: string;
  onSelectClassTab: (className: string) => void;
  character: Character;
  levelsToShow: number[];
  subclassLevel: number;
  asiLevels: number[];
  spellChoicesByLevel: Map<
    number,
    {
      cantrips: number;
      spells: number;
      maxSpellLevel: number;
    }
  >;
  optFeatureProgressions: Array<{
    name?: string;
    featureType: string[];
    progression: number[] | Record<string, number>;
  }>;
  classFeatProgressions: ClassFeatProgression[];
  featuresByLevel: Map<number, ClassFeatureDisplay[]>;
  subclassFeatureName: string | null;
  selectedFeature: SelectedFeatureState | null;
  viewingClassData?: Class5e;
  viewingSubclass?: string;
  viewingSubclassData?: Subclass5e;
  detailCollapsed: boolean;
  viewingClass: string;
  viewingClassLevel: number;
  selectedNames: Set<string>;
  optFeatures: OptionalFeatureLike[];
  featByCompositeId: Map<string, Feat5e>;
  feats: Feat5e[];
  spellByName: Map<string, Spell5e>;
  appliedAsiChoicesForClass: AsiChoice[];
  asiModeByLevel: Record<string, 'asi' | 'feat'>;
  usedASI: number;
  totalASIAcrossClasses: number;
  onOpenClassPicker: () => void;
  onOpenSubclassPicker: () => void;
  onOpenSpellPicker: (level: number) => void;
  onOpenFeatPicker: () => void;
  onOpenAsiPicker: (level: number) => void;
  onOpenOptPicker: (state: {
    progName: string;
    featureTypes: string[];
    total: number;
  }) => void;
  onOpenClassFeatPicker: (state: {
    progName: string;
    categories: string[];
    total: number;
  }) => void;
  onSelectFeature: (feature: SelectedFeatureState) => void;
  onExpandDetails: () => void;
  onAsiReset: (level: number) => void;
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void;
  onClearFeatSelectionsForAsi: () => void;
  getOrdinalForm: (n: number) => string;
}

export function BuildClassLevelsPanel({
  classProgression,
  selectedClassTab,
  onSelectClassTab,
  character,
  levelsToShow,
  subclassLevel,
  asiLevels,
  spellChoicesByLevel,
  optFeatureProgressions,
  classFeatProgressions,
  featuresByLevel,
  subclassFeatureName,
  selectedFeature,
  viewingClassData,
  viewingSubclass,
  viewingSubclassData,
  detailCollapsed,
  viewingClass,
  viewingClassLevel,
  selectedNames,
  optFeatures,
  featByCompositeId,
  feats,
  spellByName,
  appliedAsiChoicesForClass,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  onOpenClassPicker,
  onOpenSubclassPicker,
  onOpenSpellPicker,
  onOpenFeatPicker,
  onOpenAsiPicker,
  onOpenOptPicker,
  onOpenClassFeatPicker,
  onSelectFeature,
  onExpandDetails,
  onAsiReset,
  onSetAsiModeByLevel,
  onClearFeatSelectionsForAsi,
  getOrdinalForm,
}: BuildClassLevelsPanelProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0">
        {classProgression.length > 1 ? (
          <Tabs
            value={selectedClassTab || classProgression[0]?.name}
            onValueChange={(value) => onSelectClassTab(value)}
          >
            <TabsList className="w-full">
              {classProgression.map((entry) => (
                <TabsTrigger
                  key={`${entry.name}|${entry.source ?? ''}`}
                  value={entry.name}
                  className="flex-1 gap-1.5 text-xs"
                >
                  {entry.name}
                  <Badge
                    variant="secondary"
                    className="font-mono h-4 px-1 text-[10px] pointer-events-none"
                  >
                    {entry.levels}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {character.class ? `${character.class} Features` : 'Class Features'}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4">
          {!character.class ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <Sword className="h-8 w-8 opacity-30" weight="duotone" />
              <p className="text-sm">No class selected</p>
              <Button size="sm" onClick={onOpenClassPicker}>
                Choose a Class
              </Button>
            </div>
          ) : levelsToShow.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No feature data available
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={[`level-${character.level}`]}
            >
              {levelsToShow.map((lv) => {
                const isSubclassLevel = lv === subclassLevel;
                const isASILevel = (asiLevels as readonly number[]).includes(
                  lv,
                );
                const spellGain = spellChoicesByLevel.get(lv);

                const optFeatureGainsAtLevel = optFeatureProgressions.filter(
                  (prog) =>
                    getOptFeatureTotal(prog.progression, lv) >
                    getOptFeatureTotal(prog.progression, lv - 1),
                );

                const classFeatGainsAtLevel = classFeatProgressions.filter(
                  (prog) =>
                    getOptFeatureTotal(prog.progression, lv) >
                    getOptFeatureTotal(prog.progression, lv - 1),
                );

                const passiveFeatures = (featuresByLevel.get(lv) ?? []).filter(
                  (feature) => {
                    if (
                      isSubclassLevel &&
                      subclassFeatureName &&
                      feature.name === subclassFeatureName
                    )
                      return false;
                    if (
                      isASILevel &&
                      feature.name === 'Ability Score Improvement'
                    )
                      return false;
                    if (
                      classFeatGainsAtLevel.some(
                        (prog) => prog.name && prog.name === feature.name,
                      )
                    )
                      return false;
                    return true;
                  },
                );

                const choiceCount =
                  (isSubclassLevel ? 1 : 0) +
                  (isASILevel ? 1 : 0) +
                  (spellGain ? 1 : 0) +
                  optFeatureGainsAtLevel.length +
                  classFeatGainsAtLevel.length;
                const totalCount = passiveFeatures.length + choiceCount;

                return (
                  <AccordionItem key={lv} value={`level-${lv}`}>
                    <AccordionTrigger className="text-sm px-1 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          Level {lv} Features
                        </span>
                        {totalCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="text-xs font-mono h-5 px-1.5 pointer-events-none"
                          >
                            {totalCount}
                          </Badge>
                        )}
                        {choiceCount > 0 && (
                          <Badge className="text-xs h-5 px-1.5 pointer-events-none bg-warning/20 text-warning border border-warning/30 hover:bg-warning/20">
                            {choiceCount}{' '}
                            {choiceCount === 1 ? 'choice' : 'choices'}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1.5 pt-1 pb-2 px-1">
                        {isSubclassLevel &&
                          (() => {
                            const subclassFeature = subclassFeatureName
                              ? (featuresByLevel.get(lv) ?? []).find(
                                  (f) => f.name === subclassFeatureName,
                                )
                              : undefined;
                            const title =
                              (viewingClassData as { subclassTitle?: string })
                                ?.subclassTitle ?? 'Subclass';
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
                                        selectedFeature?.name ===
                                          subclassFeature.name &&
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
                                        <div className="text-xs text-muted-foreground">
                                          None selected
                                        </div>
                                      )}
                                    </div>
                                    {subclassFeature &&
                                      (subclassFeature.entries ?? []).length >
                                        0 && (
                                        <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                                      )}
                                  </button>
                                  <Button
                                    variant={
                                      viewingSubclass ? 'outline' : 'default'
                                    }
                                    size="sm"
                                    className="flex-shrink-0 ml-2 h-7 text-xs"
                                    onClick={onOpenSubclassPicker}
                                  >
                                    {viewingSubclass ? 'Change' : 'Choose'}
                                  </Button>
                                </div>
                                {viewingSubclass &&
                                  (() => {
                                    const sc = viewingSubclassData;
                                    return (
                                      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                        <button
                                          type="button"
                                          onMouseEnter={() => {
                                            onSelectFeature({
                                              name: viewingSubclass,
                                              source: sc?.source,
                                              entries:
                                                resolveSubclassFeatureRefs(
                                                  sc?.entries ?? [],
                                                  sc?.shortName,
                                                ),
                                              levelFeatures:
                                                getSubclassFeatureGroups(sc),
                                            });
                                            if (detailCollapsed)
                                              onExpandDetails();
                                          }}
                                          onClick={() =>
                                            onSelectFeature({
                                              name: viewingSubclass,
                                              source: sc?.source,
                                              entries:
                                                resolveSubclassFeatureRefs(
                                                  sc?.entries ?? [],
                                                  sc?.shortName,
                                                ),
                                              levelFeatures:
                                                getSubclassFeatureGroups(sc),
                                            })
                                          }
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                        >
                                          <span className="font-medium">
                                            {viewingSubclass}
                                          </span>
                                        </button>
                                      </div>
                                    );
                                  })()}
                              </div>
                            );
                          })()}

                        {classFeatGainsAtLevel.map((prog) => {
                          const totalAllowed = getOptFeatureTotal(
                            prog.progression,
                            viewingClassLevel,
                          );
                          const categorySet = new Set(prog.category);
                          const chosenStyles = (
                            character.specialFeats ?? []
                          ).filter((sf) => {
                            const feat = featByCompositeId.get(
                              `${sf.name}|${sf.source ?? ''}`,
                            );
                            return (
                              !!feat?.category && categorySet.has(feat.category)
                            );
                          });
                          const selectedCount = chosenStyles.length;
                          const progLabel =
                            prog.name ??
                            prog.category
                              .map((category) => featCategoryToFull(category))
                              .join(', ');
                          const isFull = selectedCount >= totalAllowed;

                          return (
                            <div
                              key={`${progLabel}|${prog.category.join('|')}`}
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
                                      {progLabel}
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
                                  variant={
                                    selectedCount > 0 ? 'outline' : 'default'
                                  }
                                  size="sm"
                                  className="flex-shrink-0 ml-2 h-7 text-xs"
                                  onClick={() =>
                                    onOpenClassFeatPicker({
                                      progName: progLabel,
                                      categories: prog.category,
                                      total: totalAllowed,
                                    })
                                  }
                                >
                                  {selectedCount > 0 ? 'Edit' : 'Choose'}
                                </Button>
                              </div>
                              {chosenStyles.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                  {chosenStyles.map((style) => {
                                    const feat = featByCompositeId.get(
                                      `${style.name}|${style.source ?? ''}`,
                                    );
                                    return (
                                      <button
                                        key={`${style.name}|${style.source ?? ''}`}
                                        type="button"
                                        onMouseEnter={() => {
                                          onSelectFeature({
                                            name: style.name,
                                            source: style.source,
                                            entries: feat?.entries ?? [],
                                          });
                                          if (detailCollapsed)
                                            onExpandDetails();
                                        }}
                                        onClick={() => {
                                          onSelectFeature({
                                            name: style.name,
                                            source: style.source,
                                            entries: feat?.entries ?? [],
                                          });
                                          if (detailCollapsed)
                                            onExpandDetails();
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                      >
                                        <span className="font-medium">
                                          {style.name}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {optFeatureGainsAtLevel.map((prog) => {
                          const totalAllowed = getOptFeatureTotal(
                            prog.progression,
                            viewingClassLevel,
                          );
                          const featuresOfType = optFeatures.filter(
                            (feature) => {
                              const featureTypes = Array.isArray(
                                feature.featureType,
                              )
                                ? feature.featureType
                                : [feature.featureType ?? ''];
                              return prog.featureType.some((type) =>
                                featureTypes.includes(type),
                              );
                            },
                          );
                          const selectedCount = featuresOfType.filter(
                            (feature) => selectedNames.has(feature.name),
                          ).length;
                          const progLabel =
                            prog.name ||
                            prog.featureType
                              .map((type) => optFeatureTypeToFull(type))
                              .join(', ');
                          const isFull = selectedCount >= totalAllowed;
                          const chosenFeatures = featuresOfType.filter(
                            (feature) => selectedNames.has(feature.name),
                          );

                          return (
                            <div
                              key={`${progLabel}|${prog.featureType.join('|')}`}
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
                                      {progLabel}
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
                                  variant={
                                    selectedCount > 0 ? 'outline' : 'default'
                                  }
                                  size="sm"
                                  className="flex-shrink-0 ml-2 h-7 text-xs"
                                  onClick={() =>
                                    onOpenOptPicker({
                                      progName: progLabel,
                                      featureTypes: prog.featureType,
                                      total: totalAllowed,
                                    })
                                  }
                                >
                                  {selectedCount > 0 ? 'Edit' : 'Choose'}
                                </Button>
                              </div>
                              {chosenFeatures.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                  {chosenFeatures.map((feature) => (
                                    <button
                                      key={`${feature.name}|${feature.source ?? ''}`}
                                      type="button"
                                      onMouseEnter={() => {
                                        onSelectFeature({
                                          name: feature.name,
                                          source: feature.source,
                                          entries: feature.entries ?? [],
                                        });
                                        if (detailCollapsed) onExpandDetails();
                                      }}
                                      onClick={() => {
                                        onSelectFeature({
                                          name: feature.name,
                                          source: feature.source,
                                          entries: feature.entries ?? [],
                                        });
                                        if (detailCollapsed) onExpandDetails();
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                    >
                                      <span className="font-medium">
                                        {feature.name}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {isASILevel &&
                          (() => {
                            const existingAsi = appliedAsiChoicesForClass.find(
                              (ac) => ac.level === lv,
                            );
                            const levelKey = `${lv}|${viewingClass}`;
                            const mode = existingAsi
                              ? 'asi'
                              : (asiModeByLevel[levelKey] ?? 'feat');
                            const isApplied = !!existingAsi;
                            const featsTaken = character.feats ?? [];
                            return (
                              <div
                                className={cn(
                                  'rounded-lg border overflow-hidden',
                                  isApplied
                                    ? 'border-success/30 bg-success/5'
                                    : mode === 'asi'
                                      ? 'border-warning/30 bg-warning/5'
                                      : 'border-info/30 bg-info/5',
                                )}
                              >
                                <div className="flex items-center justify-between px-3 py-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Star
                                      className="h-4 w-4 text-info flex-shrink-0"
                                      weight="duotone"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                                        Ability Score Improvement
                                        {isApplied && (
                                          <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {isApplied
                                          ? Object.entries(
                                              existingAsi?.abilityChanges,
                                            )
                                              .map(
                                                ([ability, bonus]) =>
                                                  `+${bonus} ${ability.charAt(0).toUpperCase() + ability.slice(1)}`,
                                              )
                                              .join(', ')
                                          : mode === 'asi'
                                            ? 'Select ability scores to increase'
                                            : usedASI > 0
                                              ? `${usedASI} of ${totalASIAcrossClasses} feat slot${totalASIAcrossClasses !== 1 ? 's' : ''} used`
                                              : 'Choose an ability score increase or take a feat'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {isApplied ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-shrink-0 h-7 text-xs"
                                        onClick={() => onAsiReset(lv)}
                                      >
                                        Change
                                      </Button>
                                    ) : mode === 'asi' ? (
                                      <Button
                                        size="sm"
                                        className="flex-shrink-0 h-7 text-xs"
                                        onClick={() => onOpenAsiPicker(lv)}
                                      >
                                        Apply
                                      </Button>
                                    ) : (
                                      <Button
                                        variant={
                                          usedASI > 0 ? 'outline' : 'default'
                                        }
                                        size="sm"
                                        className="flex-shrink-0 h-7 text-xs"
                                        onClick={onOpenFeatPicker}
                                      >
                                        {usedASI > 0
                                          ? 'Edit Feats'
                                          : 'Choose Feat'}
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                {!isApplied && (
                                  <div className="px-3 pb-2.5 pt-1 flex items-center gap-4 border-t border-info/20">
                                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`asiChoice_${lv}_${viewingClass}`}
                                        value="feat"
                                        checked={mode === 'feat'}
                                        onChange={() =>
                                          onSetAsiModeByLevel(levelKey, 'feat')
                                        }
                                        className="accent-current"
                                      />
                                      Take a Feat
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`asiChoice_${lv}_${viewingClass}`}
                                        value="asi"
                                        checked={mode === 'asi'}
                                        onChange={() => {
                                          onSetAsiModeByLevel(levelKey, 'asi');
                                          onClearFeatSelectionsForAsi();
                                        }}
                                        className="accent-current"
                                      />
                                      Ability Score Increase
                                    </label>
                                  </div>
                                )}

                                {isApplied &&
                                  (() => {
                                    const asiFeature = (
                                      featuresByLevel.get(lv) ?? []
                                    ).find(
                                      (f) =>
                                        f.name === 'Ability Score Improvement',
                                    );
                                    return (
                                      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                        {Object.entries(
                                          existingAsi?.abilityChanges,
                                        ).map(([ability, bonus]) => (
                                          <button
                                            key={ability}
                                            type="button"
                                            onMouseEnter={() => {
                                              if (!asiFeature) return;
                                              onSelectFeature({
                                                name: asiFeature.name,
                                                source: asiFeature.source,
                                                entries:
                                                  resolveSubclassFeatureRefs(
                                                    asiFeature.entries ?? [],
                                                    viewingSubclassData?.shortName,
                                                  ),
                                              });
                                              if (detailCollapsed)
                                                onExpandDetails();
                                            }}
                                            onClick={() => {
                                              if (!asiFeature) return;
                                              onSelectFeature({
                                                name: asiFeature.name,
                                                source: asiFeature.source,
                                                entries:
                                                  resolveSubclassFeatureRefs(
                                                    asiFeature.entries ?? [],
                                                    viewingSubclassData?.shortName,
                                                  ),
                                              });
                                              if (detailCollapsed)
                                                onExpandDetails();
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                          >
                                            <span className="font-medium">
                                              +{bonus}{' '}
                                              {ability.charAt(0).toUpperCase() +
                                                ability.slice(1)}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}

                                {!isApplied &&
                                  mode === 'feat' &&
                                  featsTaken.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                      {featsTaken.map((feat) => {
                                        const featData = feats.find(
                                          (f) => f.name === feat.name,
                                        );
                                        return (
                                          <button
                                            key={feat.id}
                                            type="button"
                                            onMouseEnter={() => {
                                              if (!featData) return;
                                              onSelectFeature({
                                                name: featData.name,
                                                source: featData.source,
                                                entries: featData.entries ?? [],
                                              });
                                              if (detailCollapsed)
                                                onExpandDetails();
                                            }}
                                            onClick={() => {
                                              if (!featData) return;
                                              onSelectFeature({
                                                name: featData.name,
                                                source: featData.source,
                                                entries: featData.entries ?? [],
                                              });
                                              if (detailCollapsed)
                                                onExpandDetails();
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                          >
                                            <span className="font-medium">
                                              {feat.name}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                              </div>
                            );
                          })()}

                        {spellGain &&
                          (() => {
                            const levelKey = `${viewingClass}:${lv}`;
                            const chosenNames =
                              character.spellsByLevel?.[levelKey] ?? [];
                            return (
                              <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/5 overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <MagicWand
                                      className="h-4 w-4 text-accent-secondary flex-shrink-0"
                                      weight="duotone"
                                    />
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold">
                                        Spell Selection
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {[
                                          spellGain.cantrips > 0 &&
                                            `${spellGain.cantrips} cantrip${spellGain.cantrips > 1 ? 's' : ''}`,
                                          `${spellGain.spells} spell${spellGain.spells > 1 ? 's' : ''}${spellGain.maxSpellLevel > 0 ? ` (up to ${getOrdinalForm(spellGain.maxSpellLevel)}-level)` : ''}`,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant={
                                      chosenNames.length > 0
                                        ? 'outline'
                                        : 'default'
                                    }
                                    size="sm"
                                    className="flex-shrink-0 ml-2 h-7 text-xs"
                                    onClick={() => onOpenSpellPicker(lv)}
                                  >
                                    {chosenNames.length > 0 ? 'Edit' : 'Choose'}
                                  </Button>
                                </div>
                                {chosenNames.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-accent-secondary/20 pt-2">
                                    {chosenNames.map((name) => {
                                      const spell = spellByName.get(name);
                                      return (
                                        <button
                                          key={
                                            spell
                                              ? `${spell.name}|${spell.source ?? ''}`
                                              : name
                                          }
                                          type="button"
                                          onMouseEnter={() => {
                                            if (!spell) return;
                                            onSelectFeature({
                                              name: spell.name,
                                              source: spell.source,
                                              entries: spell.entries ?? [],
                                            });
                                            if (detailCollapsed)
                                              onExpandDetails();
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-accent-secondary/30 bg-accent-secondary/5 hover:border-accent-secondary/50 hover:bg-accent-secondary/15 text-foreground transition-colors"
                                        >
                                          <span className="font-medium">
                                            {name}
                                          </span>
                                          {spell && (
                                            <span className="text-muted-foreground opacity-80">
                                              {formatSpellLevel(spell.level)}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                        {passiveFeatures.map((feature) => (
                          <button
                            key={`${feature.name}|${feature.source ?? ''}`}
                            type="button"
                            onClick={() => {
                              onSelectFeature({
                                name: feature.name,
                                source: feature.source,
                                entries: resolveSubclassFeatureRefs(
                                  feature.entries ?? [],
                                  viewingSubclassData?.shortName,
                                ),
                              });
                              if (detailCollapsed) onExpandDetails();
                            }}
                            className={cn(
                              'w-full text-left px-3 py-2 rounded-md hover:bg-accent/10 hover:text-accent transition-colors group flex items-center justify-between',
                              selectedFeature?.name === feature.name &&
                                'bg-accent/10 text-accent',
                            )}
                          >
                            <span className="text-sm font-medium">
                              {feature.name}
                            </span>
                            {(feature.entries ?? []).length > 0 && (
                              <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
