import { CaretLeft, CaretRight, Sword } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useProvenance } from '@/hooks/character/useProvenance';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import {
  useClassLookup,
  useOptionalFeatureLookup,
  useSubclass,
} from '@/hooks/data/useGameData';
import type { OptionalFeatureLike } from '@/lib/5etools/classData';
import {
  getClassFeatureGroups,
  getClassSpellGainAtLevel,
  getFeatureTypes,
  getSubclassSelectionInfo,
  isNormallySelectableFeat,
  resolveSubclassFeatureRefs,
} from '@/lib/5etools/classData';
import { getEntityLookupKey } from '@/lib/5etools/lookups';
import { normalizeAbilityName } from '@/lib/calculations/abilityScores';
import { getASILevelsFromClass } from '@/lib/calculations/gameRules';
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites';
import { getOrdinalForm } from '@/lib/calculations/spellUtils';
import { NoCharCard } from '@/pages/_shared';
import {
  buildCharacterSnapshot,
  buildClassProgression,
  buildFeatModalFeats,
  buildLevelsToShow,
  countTotalAsiAcrossClasses,
  countTotalFeatSlots,
  filterClassSpells,
} from '@/pages/build/buildClassPageUtils';
import {
  BuildClassDetailsPanel,
  type ClassFeatureDisplay,
  type SelectedFeatureState,
} from '@/pages/build/components/BuildClassDetailsPanel';
import { BuildClassLevelsPanel } from '@/pages/build/components/BuildClassLevelsPanel';
import { BuildClassModals } from '@/pages/build/components/BuildClassModals';
import { useCharacterStore } from '@/store/characterStore';
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools';
import type { AbilityScores, AsiChoice } from '@/types/character';

interface SubclassOption {
  name: string;
  source?: string;
  shortName?: string;
  entries?: unknown[];
  levelFeatures?: { level: number; features: ClassFeatureDisplay[] }[];
}

interface ClassFeatProgression {
  name?: string;
  category: string[];
  progression: number[] | Record<string, number>;
}

export function BuildClassPage() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const { classes, classFeatures, optionalfeatures, spells, feats } =
    useFilteredGameData();
  const classLookup = useClassLookup();
  const optionalFeatureLookup = useOptionalFeatureLookup();
  const {
    applyClassSelection,
    applyOptionalFeatureSelection,
    applySpellSelection,
    replaceFeatSelections,
  } = useProvenance();
  const [selectedClassTab, setSelectedClassTab] = useState('');
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classPickerSearch, setClassPickerSearch] = useState('');
  const [subclassPickerOpen, setSubclassPickerOpen] = useState(false);
  const [spellPickerLevel, setSpellPickerLevel] = useState<number | null>(null);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [selectedFeature, setSelectedFeature] =
    useState<SelectedFeatureState | null>(null);
  const [optPickerState, setOptPickerState] = useState<{
    progName: string;
    featureTypes: string[];
    total: number;
  } | null>(null);
  const [featPickerOpen, setFeatPickerOpen] = useState(false);
  const [classFeatPickerState, setClassFeatPickerState] = useState<{
    progName: string;
    categories: string[];
    total: number;
  } | null>(null);
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null);
  const [asiModeByLevel, setAsiModeByLevel] = useState<
    Record<string, 'asi' | 'feat'>
  >({});
  const classProgression = buildClassProgression(character);

  const viewingEntry =
    classProgression.find((e) => e.name === selectedClassTab) ??
    classProgression[0];
  const viewingClass = viewingEntry?.name ?? character?.class;
  const viewingClassSource = viewingEntry?.source ?? character?.classSource;
  const viewingClassLevel = viewingEntry?.levels ?? character?.level ?? 1;
  const fallbackClassByName = useMemo(
    () => new Map((classes as Class5e[]).map((cls) => [cls.name, cls])),
    [classes],
  );
  const spellByName = useMemo(
    () => new Map((spells as Spell5e[]).map((s) => [s.name, s])),
    [spells],
  );
  const featByCompositeId = useMemo(
    () =>
      new Map(
        ((feats ?? []) as Feat5e[]).map((f) => [
          `${f.name}|${f.source ?? ''}`,
          f,
        ]),
      ),
    [feats],
  );

  const viewingClassData = viewingClassSource
    ? classLookup[getEntityLookupKey(viewingClass, viewingClassSource)]
    : fallbackClassByName.get(viewingClass ?? '');

  const handleClassChange = (className: string, classSource?: string) => {
    if (!character) return;
    const cls = classSource
      ? classLookup[getEntityLookupKey(className, classSource)]
      : fallbackClassByName.get(className);
    if (cls) applyClassSelection(cls, undefined);
    updateCharacter(character.id, {
      class: className,
      classSource: classSource ?? undefined,
      subclass: undefined,
      proficiencies: {
        ...character.proficiencies,
        armor: [
          ...new Set([
            ...character.proficiencies.armor,
            ...(cls?.startingProficiencies?.armor ?? []),
          ]),
        ],
        weapons: [
          ...new Set([
            ...character.proficiencies.weapons,
            ...(cls?.startingProficiencies?.weapons ?? []),
          ]),
        ],
        tools: [
          ...new Set([
            ...character.proficiencies.tools,
            ...(cls?.startingProficiencies?.tools ?? []),
          ]),
        ],
      },
      spells: {
        ...character.spells,
        spellcastingAbility: cls?.spellcastingAbility
          ? (normalizeAbilityName(cls.spellcastingAbility) ??
            cls.spellcastingAbility.toLowerCase())
          : character.spells?.spellcastingAbility,
      },
    });
    setSelectedFeature(null);
    setClassPickerOpen(false);
    setClassPickerSearch('');
  };
  const allClassFeatures = useMemo(() => {
    if (!viewingClass) return [];
    const src = viewingClassSource ?? viewingClassData?.source;
    return classFeatures
      .filter(
        (f) => f.className === viewingClass && (!src || f.classSource === src),
      )
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  }, [classFeatures, viewingClass, viewingClassSource, viewingClassData]);

  const featuresByLevel = useMemo(() => {
    return getClassFeatureGroups(allClassFeatures);
  }, [allClassFeatures]);
  const { subclassLevel, subclassFeatureName } = useMemo(() => {
    return getSubclassSelectionInfo(viewingClassData);
  }, [viewingClassData]);
  const asiLevels = getASILevelsFromClass(viewingClassData);
  const optFeatures = (optionalfeatures ?? []) as OptionalFeatureLike[];

  const isOptionalFeatureLike = (
    value: unknown,
  ): value is OptionalFeatureLike => {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { name?: unknown }).name === 'string'
    );
  };

  const findOptionalFeature = (
    name: string,
    source?: string,
  ): OptionalFeatureLike | undefined => {
    const fromLookup = optionalFeatureLookup[getEntityLookupKey(name, source)];
    if (isOptionalFeatureLike(fromLookup)) return fromLookup;
    return optFeatures.find(
      (f) => f.name === name && (source === undefined || f.source === source),
    );
  };

  const selectedNames = new Set((character?.features ?? []).map((f) => f.name));

  const handleOptFeatureConfirm = (names: string[], featureTypes: string[]) => {
    if (!character) return;
    // Keep features that belong to other types (spells, class features, feats, etc.).
    const existingNonOpt = character.features.filter((f) => {
      const of = findOptionalFeature(f.name, f.source);
      if (!of) return true;
      const fTypes = getFeatureTypes(of);
      return !featureTypes.some((t) => fTypes.includes(t));
    });
    const newFeatures = names.map((name) => {
      const feat = findOptionalFeature(name);
      return {
        id: `${name}-opt`,
        name,
        source: feat?.source ?? '',
        description: '',
      };
    });
    updateCharacter(character.id, {
      features: [...existingNonOpt, ...newFeatures],
    });
    for (const name of names) {
      const feat = findOptionalFeature(name);
      applyOptionalFeatureSelection(name, feat?.source, viewingClass, 'class');
    }
  };
  const spellChoicesByLevel = useMemo(() => {
    const map = new Map<
      number,
      { cantrips: number; spells: number; maxSpellLevel: number }
    >();
    if (!viewingClassData) return map;
    for (let lv = 1; lv <= 20; lv++) {
      const gain = getClassSpellGainAtLevel(viewingClassData, lv);
      if (gain.cantrips > 0 || gain.spells > 0) map.set(lv, gain);
    }
    return map;
  }, [viewingClassData]);
  const optFeatureProgressions = useMemo(
    () => viewingClassData?.optionalfeatureProgression ?? [],
    [viewingClassData],
  );
  const classFeatProgressions = useMemo(
    () => (viewingClassData?.featProgression ?? []) as ClassFeatProgression[],
    [viewingClassData],
  );
  const levelsToShow = useMemo(
    () =>
      buildLevelsToShow({
        allClassFeatures,
        asiLevels,
        subclassLevel,
        viewingClassLevel,
        spellChoicesByLevel,
        optFeatureProgressions,
        classFeatProgressions,
      }),
    [
      allClassFeatures,
      asiLevels,
      subclassLevel,
      viewingClassLevel,
      spellChoicesByLevel,
      optFeatureProgressions,
      classFeatProgressions,
    ],
  );
  const subclasses = useMemo(() => {
    const raw = (viewingClassData?.subclasses ?? []) as SubclassOption[];
    const allowedSources = character?.allowedSources;
    if (!allowedSources || allowedSources.length === 0) return raw;
    return raw.filter((sc) => allowedSources.includes(sc.source ?? ''));
  }, [viewingClassData?.subclasses, character?.allowedSources]);

  const subclassTitle =
    typeof viewingClassData?.subclassTitle === 'string'
      ? viewingClassData.subclassTitle
      : 'Subclass';
  const viewingSubclass = viewingEntry
    ? classProgression.length > 1
      ? viewingEntry.subclass
      : (viewingEntry.subclass ?? character?.subclass)
    : character?.subclass;
  const viewingSubclassData = useSubclass(
    viewingClass ?? '',
    viewingClassSource,
    viewingSubclass ?? '',
    viewingEntry?.subclassSource ?? character?.subclassSource,
  );

  const handleSubclassSelect = (sc: SubclassOption) => {
    if (!character) return;
    if (viewingClassData) applyClassSelection(viewingClassData, sc);
    if (classProgression.length > 0 && viewingEntry) {
      const newProg = classProgression.map((e) =>
        e.name === viewingEntry.name &&
        (e.source ?? '') === (viewingEntry.source ?? '')
          ? { ...e, subclass: sc.name, subclassSource: sc.source ?? undefined }
          : e,
      );
      const updates: Record<string, unknown> = { classProgression: newProg };
      // Keep top-level character.subclass in sync for the primary class.
      if (viewingEntry.name === character.class) {
        updates.subclass = sc.name;
        updates.subclassSource = sc.source ?? undefined;
      }
      updateCharacter(character.id, updates);
    } else {
      updateCharacter(character.id, {
        subclass: sc.name,
        subclassSource: sc.source ?? undefined,
      });
    }
    setSelectedFeature({
      name: sc.name,
      source: sc.source,
      entries: resolveSubclassFeatureRefs(sc.entries ?? [], sc.shortName),
      levelFeatures: sc.levelFeatures,
    });
    setSubclassPickerOpen(false);
    if (detailCollapsed) setDetailCollapsed(false);
  };
  const characterSnapshot: PrereqCharacterSnapshot = buildCharacterSnapshot({
    character,
    classProgression,
    viewingClass,
  });
  const totalASIAcrossClasses = useMemo(
    () =>
      countTotalAsiAcrossClasses({
        classProgression,
        character,
        classLookup,
        fallbackClassByName,
      }),
    [classLookup, classProgression, fallbackClassByName, character],
  );

  const usedASI = character?.feats?.length ?? 0;

  // Feat slots = total ASI levels earned minus those committed to ability score increases
  const totalFeatSlots = useMemo(
    () =>
      countTotalFeatSlots({
        classProgression,
        character,
        classLookup,
        fallbackClassByName,
      }),
    [classLookup, classProgression, fallbackClassByName, character],
  );

  // Applied ASI choices for the currently-viewed class (used in the accordion rows)
  const appliedAsiChoicesForClass = useMemo(
    () =>
      (character?.asiChoices ?? []).filter(
        (ac) => ac.className === viewingClass,
      ),
    [character?.asiChoices, viewingClass],
  );

  const handleFeatConfirm = (selectedFeats: Feat5e[]) => {
    replaceFeatSelections(selectedFeats);
  };

  const handleAsiApply = (
    level: number,
    abilityChanges: Record<string, 1 | 2>,
  ) => {
    if (!character) return;
    const existing = appliedAsiChoicesForClass.find((ac) => ac.level === level);
    const updatedScores = { ...character.abilityScores } as AbilityScores;
    // Revert the old ASI if re-applying
    if (existing) {
      for (const [ability, bonus] of Object.entries(existing.abilityChanges)) {
        updatedScores[ability as keyof AbilityScores] =
          (updatedScores[ability as keyof AbilityScores] ?? 10) - bonus;
      }
    }
    for (const [ability, bonus] of Object.entries(abilityChanges)) {
      updatedScores[ability as keyof AbilityScores] =
        (updatedScores[ability as keyof AbilityScores] ?? 10) + bonus;
    }
    const updatedChoices: AsiChoice[] = [
      ...(character.asiChoices ?? []).filter(
        (ac) => !(ac.level === level && ac.className === viewingClass),
      ),
      {
        id: `asi-${viewingClass}-${level}`,
        level,
        className: viewingClass,
        abilityChanges,
      },
    ];
    updateCharacter(character.id, {
      abilityScores: updatedScores,
      asiChoices: updatedChoices,
    });
    setAsiPickerLevel(null);
  };

  const handleAsiReset = (level: number) => {
    if (!character) return;
    const existing = appliedAsiChoicesForClass.find((ac) => ac.level === level);
    if (!existing) return;
    const updatedScores = { ...character.abilityScores } as AbilityScores;
    for (const [ability, bonus] of Object.entries(existing.abilityChanges)) {
      updatedScores[ability as keyof AbilityScores] =
        (updatedScores[ability as keyof AbilityScores] ?? 10) - bonus;
    }
    updateCharacter(character.id, {
      abilityScores: updatedScores,
      asiChoices: (character.asiChoices ?? []).filter(
        (ac) => !(ac.level === level && ac.className === viewingClass),
      ),
    });
    const levelKey = `${level}|${viewingClass}`;
    setAsiModeByLevel((prev) => {
      const next = { ...prev };
      delete next[levelKey];
      return next;
    });
  };

  // Merged feat list for the picker: available + any saved feats outside allowed sources
  const featModalFeats = useMemo(() => {
    const available = ((feats ?? []) as Feat5e[]).filter(
      isNormallySelectableFeat,
    );
    return buildFeatModalFeats({
      availableFeats: available,
      selectedFeats: character?.feats ?? [],
      createFallback: (selected) =>
        ({
          name: selected.name,
          source: selected.source,
          entries: [],
        }) as Feat5e,
    });
  }, [feats, character?.feats]);

  const viewingClassEntries = useMemo(
    () =>
      Array.isArray(viewingClassData?.entries)
        ? (viewingClassData.entries as unknown[])
        : [],
    [viewingClassData?.entries],
  );
  // Reduces array from ~1255 to ~100-200 before it reaches the modal,
  // cutting both filter cost and initial card render count.
  const classSpells = useMemo(
    () => filterClassSpells(spells as Spell5e[], viewingClass),
    [spells, viewingClass],
  );

  if (!character) {
    return (
      <NoCharCard
        icon={<Sword weight="duotone" />}
        noun="configure your class"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Sword className="h-6 w-6 text-accent" weight="duotone" />
            Class
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              <button
                type="button"
                onClick={() => setDetailCollapsed((c) => !c)}
                title={
                  detailCollapsed
                    ? 'Expand details panel'
                    : 'Collapse details panel'
                }
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
              >
                {detailCollapsed ? (
                  <CaretLeft className="h-3.5 w-3.5" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5" />
                )}
              </button>
              <BuildClassLevelsPanel
                classProgression={classProgression}
                selectedClassTab={selectedClassTab}
                onSelectClassTab={(value) => {
                  setSelectedClassTab(value);
                  setSelectedFeature(null);
                }}
                character={character}
                levelsToShow={levelsToShow}
                subclassLevel={subclassLevel}
                asiLevels={asiLevels}
                spellChoicesByLevel={spellChoicesByLevel}
                optFeatureProgressions={optFeatureProgressions}
                classFeatProgressions={classFeatProgressions}
                featuresByLevel={featuresByLevel}
                subclassFeatureName={subclassFeatureName}
                selectedFeature={selectedFeature}
                viewingClassData={viewingClassData}
                viewingSubclass={viewingSubclass}
                viewingSubclassData={viewingSubclassData}
                detailCollapsed={detailCollapsed}
                viewingClass={viewingClass ?? ''}
                viewingClassLevel={viewingClassLevel}
                selectedNames={selectedNames}
                optFeatures={optFeatures}
                featByCompositeId={featByCompositeId}
                feats={(feats ?? []) as Feat5e[]}
                spellByName={spellByName}
                appliedAsiChoicesForClass={appliedAsiChoicesForClass}
                asiModeByLevel={asiModeByLevel}
                usedASI={usedASI}
                totalASIAcrossClasses={totalASIAcrossClasses}
                onOpenClassPicker={() => setClassPickerOpen(true)}
                onOpenSubclassPicker={() => setSubclassPickerOpen(true)}
                onOpenSpellPicker={setSpellPickerLevel}
                onOpenFeatPicker={() => setFeatPickerOpen(true)}
                onOpenAsiPicker={setAsiPickerLevel}
                onOpenOptPicker={setOptPickerState}
                onOpenClassFeatPicker={setClassFeatPickerState}
                onSelectFeature={setSelectedFeature}
                onExpandDetails={() => setDetailCollapsed(false)}
                onAsiReset={handleAsiReset}
                onSetAsiModeByLevel={(levelKey, mode) =>
                  setAsiModeByLevel((prev) => ({
                    ...prev,
                    [levelKey]: mode,
                  }))
                }
                onClearFeatSelectionsForAsi={() => replaceFeatSelections([])}
                getOrdinalForm={getOrdinalForm}
              />
              <BuildClassDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedFeature={selectedFeature}
                viewingClassData={viewingClassData}
                viewingClassEntries={viewingClassEntries}
                viewingSubclass={viewingSubclass}
                onClearSelection={() => setSelectedFeature(null)}
              />
            </div>
          </Card>
        </div>
      </div>
      <BuildClassModals
        character={character}
        classes={classes as Class5e[]}
        classPickerOpen={classPickerOpen}
        classPickerSearch={classPickerSearch}
        onClassPickerOpenChange={setClassPickerOpen}
        onClassPickerSearchChange={setClassPickerSearch}
        onClassSelect={handleClassChange}
        spellPickerLevel={spellPickerLevel}
        onSpellPickerLevelChange={setSpellPickerLevel}
        spellChoicesByLevel={spellChoicesByLevel}
        classSpells={classSpells}
        spellByName={spellByName}
        viewingClass={viewingClass}
        viewingClassSource={viewingClassSource}
        onApplySpellSelection={applySpellSelection}
        onUpdateCharacter={(patch) => updateCharacter(character.id, patch)}
        subclassPickerOpen={subclassPickerOpen}
        onSubclassPickerOpenChange={setSubclassPickerOpen}
        subclassTitle={subclassTitle}
        subclasses={subclasses}
        viewingSubclass={viewingSubclass}
        onSubclassConfirm={handleSubclassSelect}
        optPickerState={optPickerState}
        onOptPickerStateChange={setOptPickerState}
        optFeatures={optFeatures}
        characterSnapshot={characterSnapshot}
        onOptFeatureConfirm={handleOptFeatureConfirm}
        asiPickerLevel={asiPickerLevel}
        onAsiPickerLevelChange={setAsiPickerLevel}
        appliedAsiChoicesForClass={appliedAsiChoicesForClass}
        onAsiApply={handleAsiApply}
        featPickerOpen={featPickerOpen}
        onFeatPickerOpenChange={setFeatPickerOpen}
        featModalFeats={featModalFeats}
        totalFeatSlots={totalFeatSlots}
        usedASI={usedASI}
        onFeatConfirm={handleFeatConfirm}
        classFeatPickerState={classFeatPickerState}
        onClassFeatPickerStateChange={setClassFeatPickerState}
        feats={(feats ?? []) as Feat5e[]}
        featByCompositeId={featByCompositeId}
      />
    </div>
  );
}
