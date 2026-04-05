import {
  CaretLeft,
  CaretRight,
  Check,
  MagicWand,
  Sparkle,
  Star,
  Sword,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal';
import { OptionalFeatureSelectionModal } from '@/components/modals/OptionalFeatureSelectionModal';
import type {
  ActiveFilters,
  CategoryLimit,
} from '@/components/modals/SelectionModal';
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal';
import { SubclassSelectionModal } from '@/components/modals/SubclassSelectionModal';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProvenance } from '@/hooks/character/useProvenance';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import { normalizeAbilityName } from '@/lib/calculations/abilityScores';
import {
  getASILevelsFromClass,
  getProficiencyBonus,
} from '@/lib/calculations/gameRules';
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites';
import { formatSpellLevel } from '@/lib/calculations/spellUtils';
import { matchesGameDataEntry } from '@/lib/characterUtils';
import { renderEntry } from '@/lib/renderer';
import { cn } from '@/lib/utils';
import { InfoTile, NoCharCard } from '@/pages/_shared';
import { useCharacterStore } from '@/store/characterStore';
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools';
import type { AbilityScores, AsiChoice } from '@/types/character';

/** How many cantrips / spells are gained at a given class level. */
function getSpellGainAtLevel(
  classData: Class5e | undefined,
  level: number,
): { cantrips: number; spells: number; maxSpellLevel: number } {
  if (!classData?.spellcastingAbility)
    return { cantrips: 0, spells: 0, maxSpellLevel: 0 };

  const cantripProgressionRaw = classData.cantripProgression;
  const cantripProg = Array.isArray(cantripProgressionRaw)
    ? (cantripProgressionRaw as number[])
    : undefined;
  const spellsFixedRaw = classData.spellsKnownProgressionFixed;
  const spellsFixed = Array.isArray(spellsFixedRaw)
    ? (spellsFixedRaw as number[])
    : undefined;
  const spellsKnownRaw = classData.spellsKnownProgression;
  const spellsKnown = Array.isArray(spellsKnownRaw)
    ? (spellsKnownRaw as number[])
    : undefined;

  const idx = level - 1;
  const prevIdx = level - 2;

  const cantripsNow = cantripProg ? (cantripProg[idx] ?? 0) : 0;
  const cantripsPrev =
    cantripProg && level > 1 ? (cantripProg[prevIdx] ?? 0) : 0;
  const newCantrips = Math.max(0, cantripsNow - cantripsPrev);

  let newSpells = 0;
  if (spellsFixed) {
    newSpells = spellsFixed[idx] ?? 0;
  } else if (spellsKnown) {
    const spellsNow = spellsKnown[idx] ?? 0;
    const spellsPrev = level > 1 ? (spellsKnown[prevIdx] ?? 0) : 0;
    newSpells = Math.max(0, spellsNow - spellsPrev);
  }

  // Approximate max learnable spell level for display
  const cp = classData.casterProgression;
  let maxSpellLevel = 0;
  if (cp === 'full') maxSpellLevel = Math.min(9, Math.ceil(level / 2));
  else if (cp === '1/2')
    maxSpellLevel = Math.min(5, Math.ceil((level - 1) / 2));
  else if (cp === '1/3')
    maxSpellLevel = Math.min(4, Math.ceil((level - 1) / 3));
  else if (cp === 'pact') maxSpellLevel = Math.min(5, Math.ceil(level / 2));

  return { cantrips: newCantrips, spells: newSpells, maxSpellLevel };
}

interface OptFeatureProg {
  name: string;
  featureType: string[];
  progression: number[] | Record<string, number>;
}

interface DisplayFeature {
  name: string;
  source?: string;
  entries?: unknown[];
}

interface SubclassOption {
  name: string;
  source?: string;
  entries?: unknown[];
  levelFeatures?: { level: number; features: DisplayFeature[] }[];
}

interface OptionalFeatureLike {
  name: string;
  source?: string;
  featureType?: string | string[];
  entries?: unknown[];
}

function getFeatureTypes(feature: OptionalFeatureLike): string[] {
  return Array.isArray(feature.featureType)
    ? feature.featureType
    : [feature.featureType ?? ''];
}

/** Total optional features of this type allowed at the given class level. */
function getOptFeatureTotal(
  prog: number[] | Record<string, number>,
  level: number,
): number {
  if (Array.isArray(prog)) return prog[Math.max(0, level - 1)] ?? 0;
  let total = 0;
  for (const [k, v] of Object.entries(prog)) {
    if (Number(k) <= level) total = Math.max(total, Number(v));
  }
  return total;
}

const ABILITY_OPTIONS = [
  { value: 'strength', label: 'Strength' },
  { value: 'dexterity', label: 'Dexterity' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'intelligence', label: 'Intelligence' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'charisma', label: 'Charisma' },
];

interface AsiPickerDialogProps {
  open: boolean;
  level: number;
  existingChanges?: Record<string, 1 | 2>;
  onApply: (changes: Record<string, 1 | 2>) => void;
  onClose: () => void;
}

function AsiPickerDialog({
  open,
  level,
  existingChanges,
  onApply,
  onClose,
}: AsiPickerDialogProps) {
  const [ability1, setAbility1] = useState<string>(
    existingChanges ? (Object.keys(existingChanges)[0] ?? '') : '',
  );
  const [bonus1, setBonus1] = useState<'1' | '2'>(
    existingChanges
      ? Object.values(existingChanges)[0] === 1
        ? '1'
        : '2'
      : '2',
  );
  const [ability2, setAbility2] = useState<string>(
    existingChanges && Object.keys(existingChanges).length > 1
      ? (Object.keys(existingChanges)[1] ?? '')
      : '',
  );

  const showAbility2 = bonus1 === '1';

  const handleApply = () => {
    if (!ability1) return;
    const changes: Record<string, 1 | 2> = {
      [ability1]: Number.parseInt(bonus1, 10) as 1 | 2,
    };
    if (showAbility2) {
      if (!ability2 || ability2 === ability1) return;
      changes[ability2] = 1;
    }
    onApply(changes);
  };

  const canApply =
    ability1 && (!showAbility2 || (ability2 && ability2 !== ability1));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ability Score Increase — Level {level}</DialogTitle>
          <DialogDescription>
            Increase one ability by +2, or two different abilities by +1 each.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select value={ability1} onValueChange={setAbility1}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Ability" />
                </SelectTrigger>
                <SelectContent>
                  {ABILITY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-xs"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-20">
              <Select
                value={bonus1}
                onValueChange={(v) => setBonus1(v as '1' | '2')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2" className="text-xs">
                    +2
                  </SelectItem>
                  <SelectItem value="1" className="text-xs">
                    +1
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {showAbility2 && (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Select value={ability2} onValueChange={setAbility2}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Second ability" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABILITY_OPTIONS.filter(
                      (opt) => opt.value !== ability1,
                    ).map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-xs"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20">
                <div className="h-8 flex items-center justify-center text-xs text-muted-foreground border rounded-md bg-muted/30">
                  +1
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!canApply} onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BuildClassPage() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const { classes, classFeatures, optionalfeatures, spells, feats } =
    useFilteredGameData();
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
  const [selectedFeature, setSelectedFeature] = useState<{
    name: string;
    source?: string;
    entries: unknown[];
    levelFeatures?: { level: number; features: DisplayFeature[] }[];
  } | null>(null);
  const [optPickerState, setOptPickerState] = useState<{
    progName: string;
    featureTypes: string[];
    total: number;
  } | null>(null);
  const [featPickerOpen, setFeatPickerOpen] = useState(false);
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null);
  const [asiModeByLevel, setAsiModeByLevel] = useState<
    Record<string, 'asi' | 'feat'>
  >({});
  const classProgression = character?.classProgression?.length
    ? character.classProgression
    : character?.class
      ? [
          {
            name: character.class,
            source: character.classSource,
            levels: character.level,
          },
        ]
      : [];

  const viewingEntry =
    classProgression.find((e) => e.name === selectedClassTab) ??
    classProgression[0];
  const viewingClass = viewingEntry?.name ?? character?.class;
  const viewingClassSource = viewingEntry?.source ?? character?.classSource;
  const viewingClassLevel = viewingEntry?.levels ?? character?.level ?? 1;

  const viewingClassData = classes.find((c) =>
    matchesGameDataEntry(viewingClass, viewingClassSource, c),
  ) as Class5e | undefined;

  const handleClassChange = (className: string, classSource?: string) => {
    const cls = classes.find((c) =>
      matchesGameDataEntry(className, classSource, c),
    ) as Class5e | undefined;
    if (cls) applyClassSelection(cls, undefined);
    updateCharacter(character.id, {
      class: className,
      classSource: classSource ?? undefined,
      subclass: undefined,
      proficiencyBonus: getProficiencyBonus(character.level),
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
    const map = new Map<number, typeof allClassFeatures>();
    for (const f of allClassFeatures) {
      const lv = f.level ?? 0;
      if (!map.has(lv)) map.set(lv, []);
      map.get(lv)?.push(f);
    }
    return map;
  }, [allClassFeatures]);
  // gainSubclassFeature lives on the class.classFeatures ref array, not the parsed
  // classFeature objects, so we read it from viewingClassData.
  const { subclassLevel, subclassFeatureName } = useMemo(() => {
    const refs = (viewingClassData?.classFeatures ?? []) as Array<
      string | { gainSubclassFeature?: boolean; classFeature?: string }
    >;
    const ref = refs.find(
      (r): r is { gainSubclassFeature?: boolean; classFeature?: string } =>
        typeof r === 'object' && r !== null && r.gainSubclassFeature === true,
    );
    const name = ref?.classFeature
      ? String(ref.classFeature).split('|')[0]
      : null;
    const feature = name ? allClassFeatures.find((f) => f.name === name) : null;
    return { subclassLevel: feature?.level ?? 3, subclassFeatureName: name };
  }, [allClassFeatures, viewingClassData]);
  const asiLevels = getASILevelsFromClass(viewingClassData);
  const optFeatures = (optionalfeatures ?? []) as OptionalFeatureLike[];

  const selectedNames = new Set((character?.features ?? []).map((f) => f.name));

  const handleOptFeatureConfirm = (names: string[], featureTypes: string[]) => {
    // Keep features that belong to other types (spells, class features, feats, etc.).
    const existingNonOpt = character.features.filter((f) => {
      const of = optFeatures.find((o) => o.name === f.name);
      if (!of) return true;
      const fTypes = getFeatureTypes(of);
      return !featureTypes.some((t) => fTypes.includes(t));
    });
    const newFeatures = names.map((name) => {
      const feat = optFeatures.find((f) => f.name === name);
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
      const feat = optFeatures.find((f) => f.name === name);
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
      const gain = getSpellGainAtLevel(viewingClassData, lv);
      if (gain.cantrips > 0 || gain.spells > 0) map.set(lv, gain);
    }
    return map;
  }, [viewingClassData]);
  const optFeatureProgressions = useMemo(
    () =>
      (viewingClassData?.optionalfeatureProgression ?? []) as OptFeatureProg[],
    [viewingClassData],
  );
  const levelsToShow = useMemo(() => {
    const set = new Set<number>();
    allClassFeatures.forEach((f) => {
      if (f.level && f.level <= viewingClassLevel) set.add(f.level);
    });
    asiLevels
      .filter((l) => l <= viewingClassLevel)
      .forEach((l) => {
        set.add(l);
      });
    if (subclassLevel <= viewingClassLevel) set.add(subclassLevel);
    spellChoicesByLevel.forEach((_, lv) => {
      if (lv <= viewingClassLevel) set.add(lv);
    });
    for (const prog of optFeatureProgressions) {
      for (let lv = 1; lv <= viewingClassLevel; lv++) {
        if (
          getOptFeatureTotal(prog.progression, lv) >
          getOptFeatureTotal(prog.progression, lv - 1)
        )
          set.add(lv);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [
    allClassFeatures,
    asiLevels,
    subclassLevel,
    viewingClassLevel,
    spellChoicesByLevel,
    optFeatureProgressions,
  ]);
  const subclasses = (viewingClassData?.subclasses ?? []) as SubclassOption[];
  const subclassTitle =
    typeof viewingClassData?.subclassTitle === 'string'
      ? viewingClassData.subclassTitle
      : 'Subclass';
  const viewingSubclass = viewingEntry
    ? classProgression.length > 1
      ? viewingEntry.subclass
      : (viewingEntry.subclass ?? character?.subclass)
    : character?.subclass;

  const handleSubclassSelect = (sc: SubclassOption) => {
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
      entries: sc.entries ?? [],
      levelFeatures: sc.levelFeatures,
    });
    setSubclassPickerOpen(false);
    if (detailCollapsed) setDetailCollapsed(false);
  };
  const characterSnapshot: PrereqCharacterSnapshot = {
    level: character?.level ?? 0,
    class: viewingClass,
    race: character?.race,
    abilityScores: character?.abilityScores,
    features: character?.features ?? [],
    spells: {
      cantrips: character.spells?.cantrips ?? [],
      spellsKnown: character.spells?.spellsKnown ?? [],
      preparedSpells: character.spells?.preparedSpells ?? [],
    },
    ...(classProgression.length > 0
      ? {
          progression: {
            classes: classProgression.map((e) => ({
              name: e.name,
              levels: e.levels,
              source: e.source,
            })),
          },
        }
      : {}),
  };
  const totalASIAcrossClasses = useMemo(() => {
    let count = 0;
    const progressions =
      classProgression.length > 0
        ? classProgression
        : character.class
          ? [{ name: character.class, levels: character.level }]
          : [];
    for (const entry of progressions) {
      const cls = classes.find((c) => c.name === entry.name);
      const levels = getASILevelsFromClass(cls);
      count += levels.filter((l: number) => l <= (entry.levels ?? 0)).length;
    }
    return count;
  }, [classProgression, classes, character.class, character.level]);

  const usedASI = character.feats?.length ?? 0;

  // Feat slots = total ASI levels earned minus those committed to ability score increases
  const totalFeatSlots = useMemo(() => {
    const progressions =
      classProgression.length > 0
        ? classProgression
        : character.class
          ? [{ name: character.class, levels: character.level }]
          : [];
    let count = 0;
    for (const entry of progressions) {
      const cls = classes.find((c) => c.name === entry.name);
      const earned = getASILevelsFromClass(cls).filter(
        (l: number) => l <= (entry.levels ?? 0),
      );
      const usedForAsi = (character.asiChoices ?? []).filter(
        (ac) => ac.className === entry.name && earned.includes(ac.level),
      ).length;
      count += earned.length - usedForAsi;
    }
    return count;
  }, [
    classProgression,
    classes,
    character.class,
    character.level,
    character.asiChoices,
  ]);

  // Applied ASI choices for the currently-viewed class (used in the accordion rows)
  const appliedAsiChoicesForClass = useMemo(
    () =>
      (character.asiChoices ?? []).filter(
        (ac) => ac.className === viewingClass,
      ),
    [character.asiChoices, viewingClass],
  );

  const handleFeatConfirm = (selectedFeats: Feat5e[]) => {
    replaceFeatSelections(selectedFeats);
  };

  const handleAsiApply = (
    level: number,
    abilityChanges: Record<string, 1 | 2>,
  ) => {
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
    const available = (feats ?? []) as Feat5e[];
    const availableIds = new Set(
      available.map((f) => `${f.name}|${f.source ?? ''}`),
    );
    const savedNotInList = (character.feats ?? [])
      .filter((f) => !availableIds.has(`${f.name}|${f.source ?? ''}`))
      .map((f) => ({ name: f.name, source: f.source, entries: [] }) as Feat5e);
    return [...available, ...savedNotInList];
  }, [feats, character.feats]);
  const filteredClasses = useMemo(
    () =>
      classes.filter(
        (c) =>
          !classPickerSearch ||
          c.name.toLowerCase().includes(classPickerSearch.toLowerCase()),
      ),
    [classes, classPickerSearch],
  );
  // Reduces array from ~1255 to ~100-200 before it reaches the modal,
  // cutting both filter cost and initial card render count.
  const classSpells = useMemo(() => {
    const classLower = viewingClass?.toLowerCase();
    if (!classLower) return spells as Spell5e[];
    return (spells as Spell5e[]).filter((s) => {
      const fromList = s.classes?.fromClassList ?? [];
      return (
        fromList.length === 0 ||
        fromList.some((c) => c.name?.toLowerCase() === classLower)
      );
    });
  }, [spells, viewingClass]);

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
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex-shrink-0">
                  {classProgression.length > 1 ? (
                    <Tabs
                      value={selectedClassTab || classProgression[0]?.name}
                      onValueChange={(v) => {
                        setSelectedClassTab(v);
                        setSelectedFeature(null);
                      }}
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
                      {character.class
                        ? `${character.class} Features`
                        : 'Class Features'}
                    </span>
                  )}
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    {!character.class ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
                        <Sword
                          className="h-8 w-8 opacity-30"
                          weight="duotone"
                        />
                        <p className="text-sm">No class selected</p>
                        <Button
                          size="sm"
                          onClick={() => setClassPickerOpen(true)}
                        >
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
                          const isASILevel = (
                            asiLevels as readonly number[]
                          ).includes(lv);
                          const spellGain = spellChoicesByLevel.get(lv);

                          const optFeatureGainsAtLevel =
                            optFeatureProgressions.filter(
                              (prog) =>
                                getOptFeatureTotal(prog.progression, lv) >
                                getOptFeatureTotal(prog.progression, lv - 1),
                            );

                          // Passive features: exclude the subclass unlock entry and ASI entries
                          // since those are surfaced as dedicated choice rows
                          const passiveFeatures = (
                            featuresByLevel.get(lv) ?? []
                          ).filter((f) => {
                            if (
                              isSubclassLevel &&
                              subclassFeatureName &&
                              f.name === subclassFeatureName
                            )
                              return false;
                            if (
                              isASILevel &&
                              f.name === 'Ability Score Improvement'
                            )
                              return false;
                            return true;
                          });

                          const choiceCount =
                            (isSubclassLevel ? 1 : 0) +
                            (isASILevel ? 1 : 0) +
                            (spellGain ? 1 : 0) +
                            optFeatureGainsAtLevel.length;
                          const totalCount =
                            passiveFeatures.length + choiceCount;

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
                                  {/* Subclass choice row */}
                                  {isSubclassLevel &&
                                    (() => {
                                      const subclassFeature =
                                        subclassFeatureName
                                          ? (
                                              featuresByLevel.get(lv) ?? []
                                            ).find(
                                              (f) =>
                                                f.name === subclassFeatureName,
                                            )
                                          : undefined;
                                      const subclassTitle =
                                        (
                                          viewingClassData as {
                                            subclassTitle?: string;
                                          }
                                        )?.subclassTitle ?? 'Subclass';
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
                                                if (subclassFeature) {
                                                  setSelectedFeature({
                                                    name: subclassFeature.name,
                                                    source:
                                                      subclassFeature.source,
                                                    entries:
                                                      subclassFeature.entries ??
                                                      [],
                                                  });
                                                  if (detailCollapsed)
                                                    setDetailCollapsed(false);
                                                }
                                              }}
                                            >
                                              <Star
                                                className="h-4 w-4 text-accent flex-shrink-0"
                                                weight="duotone"
                                              />
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 text-sm font-semibold">
                                                  {subclassTitle}
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
                                                (subclassFeature.entries ?? [])
                                                  .length > 0 && (
                                                  <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                                                )}
                                            </button>
                                            <Button
                                              variant={
                                                viewingSubclass
                                                  ? 'outline'
                                                  : 'default'
                                              }
                                              size="sm"
                                              className="flex-shrink-0 ml-2 h-7 text-xs"
                                              onClick={() =>
                                                setSubclassPickerOpen(true)
                                              }
                                            >
                                              {viewingSubclass
                                                ? 'Change'
                                                : 'Choose'}
                                            </Button>
                                          </div>
                                          {viewingSubclass &&
                                            (() => {
                                              const sc = subclasses.find(
                                                (s) =>
                                                  s.name === viewingSubclass,
                                              );
                                              return (
                                                <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                                  <button
                                                    type="button"
                                                    onMouseEnter={() => {
                                                      setSelectedFeature({
                                                        name: viewingSubclass,
                                                        source: sc?.source,
                                                        entries:
                                                          sc?.entries ?? [],
                                                        levelFeatures:
                                                          sc?.levelFeatures,
                                                      });
                                                      if (detailCollapsed)
                                                        setDetailCollapsed(
                                                          false,
                                                        );
                                                    }}
                                                    onClick={() =>
                                                      setSelectedFeature({
                                                        name: viewingSubclass,
                                                        source: sc?.source,
                                                        entries:
                                                          sc?.entries ?? [],
                                                        levelFeatures:
                                                          sc?.levelFeatures,
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

                                  {/* Optional feature choice rows (Invocations, Fighting Styles, Metamagic…) */}
                                  {optFeatureGainsAtLevel.map((prog) => {
                                    const totalAllowed = getOptFeatureTotal(
                                      prog.progression,
                                      viewingClassLevel,
                                    );
                                    const featuresOfType = optFeatures.filter(
                                      (f) => {
                                        const fTypes: string[] = Array.isArray(
                                          f.featureType,
                                        )
                                          ? f.featureType
                                          : [f.featureType ?? ''];
                                        return prog.featureType.some((t) =>
                                          fTypes.includes(t),
                                        );
                                      },
                                    );
                                    const selectedCount = featuresOfType.filter(
                                      (f) => selectedNames.has(f.name),
                                    ).length;
                                    const isFull =
                                      selectedCount >= totalAllowed;
                                    const chosenFeatures =
                                      featuresOfType.filter((f) =>
                                        selectedNames.has(f.name),
                                      );
                                    return (
                                      <div
                                        key={prog.name}
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
                                                {prog.name}
                                                {isFull && (
                                                  <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
                                                )}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {selectedCount} / {totalAllowed}{' '}
                                                chosen
                                              </div>
                                            </div>
                                          </div>
                                          <Button
                                            variant={
                                              selectedCount > 0
                                                ? 'outline'
                                                : 'default'
                                            }
                                            size="sm"
                                            className="flex-shrink-0 ml-2 h-7 text-xs"
                                            onClick={() =>
                                              setOptPickerState({
                                                progName: prog.name,
                                                featureTypes: prog.featureType,
                                                total: totalAllowed,
                                              })
                                            }
                                          >
                                            {selectedCount > 0
                                              ? 'Edit'
                                              : 'Choose'}
                                          </Button>
                                        </div>
                                        {chosenFeatures.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
                                            {chosenFeatures.map((feat) => (
                                              <button
                                                key={feat.name}
                                                type="button"
                                                onMouseEnter={() => {
                                                  setSelectedFeature({
                                                    name: feat.name,
                                                    source: feat.source,
                                                    entries: feat.entries ?? [],
                                                  });
                                                  if (detailCollapsed)
                                                    setDetailCollapsed(false);
                                                }}
                                                onClick={() => {
                                                  setSelectedFeature({
                                                    name: feat.name,
                                                    source: feat.source,
                                                    entries: feat.entries ?? [],
                                                  });
                                                  if (detailCollapsed)
                                                    setDetailCollapsed(false);
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                              >
                                                <span className="font-medium">
                                                  {feat.name}
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
                                      const existingAsi =
                                        appliedAsiChoicesForClass.find(
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
                                                          ([a, b]) =>
                                                            `+${b} ${a.charAt(0).toUpperCase() + a.slice(1)}`,
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
                                                  onClick={() =>
                                                    handleAsiReset(lv)
                                                  }
                                                >
                                                  Change
                                                </Button>
                                              ) : mode === 'asi' ? (
                                                <Button
                                                  size="sm"
                                                  className="flex-shrink-0 h-7 text-xs"
                                                  onClick={() =>
                                                    setAsiPickerLevel(lv)
                                                  }
                                                >
                                                  Apply
                                                </Button>
                                              ) : (
                                                <Button
                                                  variant={
                                                    usedASI > 0
                                                      ? 'outline'
                                                      : 'default'
                                                  }
                                                  size="sm"
                                                  className="flex-shrink-0 h-7 text-xs"
                                                  onClick={() =>
                                                    setFeatPickerOpen(true)
                                                  }
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
                                                    setAsiModeByLevel(
                                                      (prev) => ({
                                                        ...prev,
                                                        [levelKey]: 'feat',
                                                      }),
                                                    )
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
                                                    setAsiModeByLevel(
                                                      (prev) => ({
                                                        ...prev,
                                                        [levelKey]: 'asi',
                                                      }),
                                                    );
                                                    replaceFeatSelections([]);
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
                                                  f.name ===
                                                  'Ability Score Improvement',
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
                                                        if (asiFeature) {
                                                          setSelectedFeature({
                                                            name: asiFeature.name,
                                                            source:
                                                              asiFeature.source,
                                                            entries:
                                                              asiFeature.entries ??
                                                              [],
                                                          });
                                                          if (detailCollapsed)
                                                            setDetailCollapsed(
                                                              false,
                                                            );
                                                        }
                                                      }}
                                                      onClick={() => {
                                                        if (asiFeature) {
                                                          setSelectedFeature({
                                                            name: asiFeature.name,
                                                            source:
                                                              asiFeature.source,
                                                            entries:
                                                              asiFeature.entries ??
                                                              [],
                                                          });
                                                          if (detailCollapsed)
                                                            setDetailCollapsed(
                                                              false,
                                                            );
                                                        }
                                                      }}
                                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                                                    >
                                                      <span className="font-medium">
                                                        +{bonus}{' '}
                                                        {ability
                                                          .charAt(0)
                                                          .toUpperCase() +
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
                                                  const featData = (
                                                    feats as Feat5e[]
                                                  ).find(
                                                    (f) => f.name === feat.name,
                                                  );
                                                  return (
                                                    <button
                                                      key={feat.id}
                                                      type="button"
                                                      onMouseEnter={() => {
                                                        if (featData) {
                                                          setSelectedFeature({
                                                            name: featData.name,
                                                            source:
                                                              featData.source,
                                                            entries:
                                                              featData.entries ??
                                                              [],
                                                          });
                                                          if (detailCollapsed)
                                                            setDetailCollapsed(
                                                              false,
                                                            );
                                                        }
                                                      }}
                                                      onClick={() => {
                                                        if (featData) {
                                                          setSelectedFeature({
                                                            name: featData.name,
                                                            source:
                                                              featData.source,
                                                            entries:
                                                              featData.entries ??
                                                              [],
                                                          });
                                                          if (detailCollapsed)
                                                            setDetailCollapsed(
                                                              false,
                                                            );
                                                        }
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
                                        character.spellsByLevel?.[levelKey] ??
                                        [];
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
                                                    spellGain.spells > 0 &&
                                                      `${spellGain.spells} spell${spellGain.spells > 1 ? 's' : ''}${spellGain.maxSpellLevel > 0 ? ` (up to ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][spellGain.maxSpellLevel - 1] ?? `${spellGain.maxSpellLevel}th`}-level)` : ''}`,
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
                                              onClick={() =>
                                                setSpellPickerLevel(lv)
                                              }
                                            >
                                              {chosenNames.length > 0
                                                ? 'Edit'
                                                : 'Choose'}
                                            </Button>
                                          </div>
                                          {chosenNames.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-accent-secondary/20 pt-2">
                                              {chosenNames.map((name) => {
                                                const spell = (
                                                  spells as Spell5e[]
                                                ).find((s) => s.name === name);
                                                return (
                                                  <button
                                                    key={name}
                                                    type="button"
                                                    onMouseEnter={() => {
                                                      if (spell) {
                                                        setSelectedFeature({
                                                          name: spell.name,
                                                          source: spell.source,
                                                          entries:
                                                            spell.entries ?? [],
                                                        });
                                                        if (detailCollapsed)
                                                          setDetailCollapsed(
                                                            false,
                                                          );
                                                      }
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-accent-secondary/30 bg-accent-secondary/5 hover:border-accent-secondary/50 hover:bg-accent-secondary/15 text-foreground transition-colors"
                                                  >
                                                    <span className="font-medium">
                                                      {name}
                                                    </span>
                                                    {spell && (
                                                      <span className="text-muted-foreground opacity-80">
                                                        {formatSpellLevel(
                                                          spell.level,
                                                        )}
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
                                  {passiveFeatures.map((f, _i: number) => (
                                    <button
                                      key={`${f.name}|${f.source ?? ''}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedFeature({
                                          name: f.name,
                                          source: f.source,
                                          entries: f.entries ?? [],
                                        });
                                        if (detailCollapsed)
                                          setDetailCollapsed(false);
                                      }}
                                      className={cn(
                                        'w-full text-left px-3 py-2 rounded-md hover:bg-accent/10 hover:text-accent transition-colors group flex items-center justify-between',
                                        selectedFeature?.name === f.name &&
                                          'bg-accent/10 text-accent',
                                      )}
                                    >
                                      <span className="text-sm font-medium">
                                        {f.name}
                                      </span>
                                      {(f.entries ?? []).length > 0 && (
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
              <div
                className={cn(
                  'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                  detailCollapsed
                    ? 'w-0 min-w-0 opacity-0 pointer-events-none'
                    : 'w-1/2 min-w-[320px]',
                )}
              >
                <div className="p-4 border-b border-border flex-shrink-0">
                  {selectedFeature ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedFeature(null)}
                        className="text-xs text-accent hover:underline flex items-center gap-1 mb-2"
                      >
                        <CaretLeft className="h-3 w-3" /> All features
                      </button>
                      <h3 className="text-lg font-display font-bold">
                        {selectedFeature.name}
                      </h3>
                      {selectedFeature.source && (
                        <span className="text-xs text-muted-foreground">
                          Source: {selectedFeature.source}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Details
                    </span>
                  )}
                </div>
                {selectedFeature ? (
                  <ScrollArea className="flex-1 overflow-hidden">
                    <div className="p-4 space-y-4">
                      {selectedFeature.levelFeatures ? (
                        <>
                          {selectedFeature.entries
                            .filter((e) => typeof e === 'string')
                            .map((e) => (
                              <p
                                key={e}
                                className="text-sm text-muted-foreground leading-relaxed"
                              >
                                {e}
                              </p>
                            ))}
                          {selectedFeature.levelFeatures
                            .slice()
                            .sort((a, b) => a.level - b.level)
                            .map(({ level, features }) => (
                              <div key={level}>
                                <div className="flex items-center gap-2 mb-3">
                                  <Badge
                                    variant="outline"
                                    className="text-xs font-mono flex-shrink-0"
                                  >
                                    Level {level}
                                  </Badge>
                                  <div className="flex-1 h-px bg-border" />
                                </div>
                                <div className="space-y-4">
                                  {features.map((feat) => (
                                    <div
                                      key={`${feat.name}|${feat.source ?? ''}`}
                                    >
                                      <div className="text-sm font-semibold mb-1">
                                        {feat.name}
                                      </div>
                                      {feat.entries?.map((e) => (
                                        <div
                                          key={
                                            typeof e === 'string'
                                              ? e
                                              : JSON.stringify(e)
                                          }
                                          className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                                          dangerouslySetInnerHTML={{
                                            __html: renderEntry(e),
                                          }}
                                        />
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </>
                      ) : selectedFeature.entries.length > 0 ? (
                        selectedFeature.entries.map((e) => (
                          <div
                            key={typeof e === 'string' ? e : JSON.stringify(e)}
                            className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:p-2"
                            dangerouslySetInnerHTML={{ __html: renderEntry(e) }}
                          />
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No description available.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                ) : viewingClassData ? (
                  <ScrollArea className="flex-1 overflow-hidden">
                    <div className="p-4 space-y-4">
                      <div>
                        <h2 className="text-2xl font-display font-bold">
                          {viewingClassData.name}
                        </h2>
                        <Badge variant="outline" className="mt-2">
                          {viewingClassData.source}
                        </Badge>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-3 gap-3">
                        <InfoTile title="Hit Die">
                          <span className="text-sm font-mono">
                            d{viewingClassData.hd?.faces ?? 8}
                          </span>
                        </InfoTile>
                        <InfoTile title="Subclass">
                          <span className="text-sm">
                            {viewingSubclass ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </InfoTile>
                        <InfoTile title="Spellcasting">
                          <span className="text-sm capitalize">
                            {viewingClassData.spellcastingAbility ? (
                              (normalizeAbilityName(
                                viewingClassData.spellcastingAbility,
                              ) ?? viewingClassData.spellcastingAbility)
                            ) : (
                              <span className="text-muted-foreground">
                                None
                              </span>
                            )}
                          </span>
                        </InfoTile>
                      </div>

                      {(viewingClassData.startingProficiencies?.armor?.length ??
                        0) > 0 && (
                        <InfoTile title="Armor Proficiencies">
                          <span
                            className="text-sm [&_a]:text-accent [&_a]:no-underline"
                            dangerouslySetInnerHTML={{
                              __html:
                                viewingClassData.startingProficiencies?.armor
                                  ?.map((v: string) =>
                                    renderEntry(v).replace(/^<p>|<\/p>$/g, ''),
                                  )
                                  .join(', '),
                            }}
                          />
                        </InfoTile>
                      )}
                      {(viewingClassData.startingProficiencies?.weapons
                        ?.length ?? 0) > 0 && (
                        <InfoTile title="Weapon Proficiencies">
                          <span
                            className="text-sm [&_a]:text-accent [&_a]:no-underline"
                            dangerouslySetInnerHTML={{
                              __html:
                                viewingClassData.startingProficiencies?.weapons
                                  ?.map((v: string) =>
                                    renderEntry(v).replace(/^<p>|<\/p>$/g, ''),
                                  )
                                  .join(', '),
                            }}
                          />
                        </InfoTile>
                      )}
                      {(viewingClassData.startingProficiencies?.tools?.length ??
                        0) > 0 && (
                        <InfoTile title="Tool Proficiencies">
                          <span
                            className="text-sm [&_a]:text-accent [&_a]:no-underline"
                            dangerouslySetInnerHTML={{
                              __html:
                                viewingClassData.startingProficiencies?.tools
                                  ?.map((v: string) =>
                                    renderEntry(v).replace(/^<p>|<\/p>$/g, ''),
                                  )
                                  .join(', '),
                            }}
                          />
                        </InfoTile>
                      )}
                      {(viewingClassData.proficiency?.length ?? 0) > 0 && (
                        <InfoTile title="Saving Throws">
                          <span className="text-sm capitalize">
                            {viewingClassData.proficiency
                              ?.map((a: string) => normalizeAbilityName(a) ?? a)
                              .join(', ')}
                          </span>
                        </InfoTile>
                      )}

                      {(viewingClassData.entries ?? []).length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-3">
                            Description
                          </h4>
                          <div className="space-y-2">
                            {(viewingClassData.entries ?? []).map((e) => (
                              <div
                                key={
                                  typeof e === 'string' ? e : JSON.stringify(e)
                                }
                                className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold"
                                dangerouslySetInnerHTML={{
                                  __html: renderEntry(e),
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-8 text-center">
                    <div>
                      <Sword
                        className="h-8 w-8 mx-auto mb-2 opacity-30"
                        weight="duotone"
                      />
                      <p>No class selected</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Dialog
        open={classPickerOpen}
        onOpenChange={(open) => {
          setClassPickerOpen(open);
          if (!open) setClassPickerSearch('');
        }}
      >
        <DialogContent className="sm:max-w-2xl flex flex-col gap-4 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Choose a Class</DialogTitle>
            <DialogDescription>Select your character's class</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search classes…"
            value={classPickerSearch}
            onChange={(e) => setClassPickerSearch(e.target.value)}
            className="h-9"
          />
          <ScrollArea className="flex-1 max-h-[55vh]">
            <div className="grid grid-cols-2 gap-2 pr-3">
              {filteredClasses.map((cls) => (
                <button
                  key={`${cls.name}|${cls.source ?? ''}`}
                  type="button"
                  onClick={() =>
                    handleClassChange(cls.name, cls.source ?? undefined)
                  }
                  className={cn(
                    'p-3 rounded-lg border-2 text-left transition-all hover:scale-[1.01]',
                    (
                      character.classSource
                        ? character.class === cls.name &&
                          character.classSource === (cls.source ?? '')
                        : character.class === cls.name
                    )
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50',
                  )}
                >
                  <div className="font-semibold font-display text-sm">
                    {cls.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    d{cls.hd?.faces ?? 8}
                    {cls.spellcastingAbility ? ' · Spellcaster' : ''}
                  </div>
                </button>
              ))}
              {filteredClasses.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground text-center py-4">
                  No classes found
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {spellPickerLevel !== null &&
        (() => {
          const gain = spellChoicesByLevel.get(spellPickerLevel);
          if (!gain) return null;
          const ownedNames = new Set([
            ...(character.spells?.cantrips ?? []),
            ...(character.spells?.spellsKnown ?? []),
          ]);
          const cats: CategoryLimit<Spell5e>[] = [];
          if (gain.cantrips > 0)
            cats.push({
              key: 'cantrips',
              label: 'cantrips',
              max: gain.cantrips,
              test: (s) => s.level === 0,
            });
          if (gain.spells > 0)
            cats.push({
              key: 'spells',
              label:
                gain.maxSpellLevel > 0
                  ? `≤${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][gain.maxSpellLevel - 1]} spells`
                  : 'spells',
              max: gain.spells,
              test: (s) =>
                s.level > 0 &&
                (gain.maxSpellLevel === 0 || s.level <= gain.maxSpellLevel),
            });
          const title = [
            gain.cantrips > 0 &&
              `Learn ${gain.cantrips} cantrip${gain.cantrips > 1 ? 's' : ''}`,
            gain.spells > 0 &&
              `${gain.spells} spell${gain.spells > 1 ? 's' : ''}${gain.maxSpellLevel > 0 ? ` (up to ${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][gain.maxSpellLevel - 1]}-level)` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ');
          // Pre-check the level filter checkboxes for available spell levels
          const levelValues: string[] = [];
          if (gain.cantrips > 0) levelValues.push('0');
          if (gain.spells > 0 && gain.maxSpellLevel > 0) {
            for (let i = 1; i <= gain.maxSpellLevel; i++)
              levelValues.push(String(i));
          }
          const allowedLevels = new Set(levelValues);
          const initialFilters: ActiveFilters = {
            level: new Set(levelValues),
            school: new Set(),
            type: new Set(),
          };
          const levelKey = `${viewingClass}:${spellPickerLevel}`;
          return (
            <SpellSelectionModal
              open={true}
              onOpenChange={(o) => {
                if (!o) setSpellPickerLevel(null);
              }}
              title={title}
              spells={classSpells}
              ownedNames={ownedNames}
              categories={cats}
              initialFilters={initialFilters}
              allowedLevels={allowedLevels}
              onConfirm={(names) => {
                const newCantrips = names.filter(
                  (n) =>
                    (spells as Spell5e[]).find((s) => s.name === n)?.level ===
                    0,
                );
                const newKnown = names.filter(
                  (n) =>
                    (spells as Spell5e[]).find((s) => s.name === n)?.level !==
                    0,
                );
                updateCharacter(character.id, {
                  spells: {
                    ...character.spells,
                    cantrips: [
                      ...new Set([
                        ...(character.spells?.cantrips ?? []),
                        ...newCantrips,
                      ]),
                    ],
                    spellsKnown: [
                      ...new Set([
                        ...(character.spells?.spellsKnown ?? []),
                        ...newKnown,
                      ]),
                    ],
                  },
                  spellsByLevel: {
                    ...(character.spellsByLevel ?? {}),
                    [levelKey]: names,
                  },
                });
                for (const name of names) {
                  applySpellSelection(viewingClass, viewingClassSource, name);
                }
                setSpellPickerLevel(null);
              }}
            />
          );
        })()}
      {subclassPickerOpen && (
        <SubclassSelectionModal
          open={subclassPickerOpen}
          onOpenChange={setSubclassPickerOpen}
          title={`Choose ${subclassTitle}`}
          subclasses={subclasses}
          selectedName={viewingSubclass ?? undefined}
          onConfirm={(sc) => {
            handleSubclassSelect(sc);
          }}
        />
      )}
      {optPickerState &&
        (() => {
          const featuresOfType = optFeatures.filter((f) => {
            const fTypes = getFeatureTypes(f);
            return optPickerState.featureTypes.some((t) => fTypes.includes(t));
          });
          const initialSelectedNames = character.features
            .filter((f) => featuresOfType.some((of) => of.name === f.name))
            .map((f) => f.name);
          return (
            <OptionalFeatureSelectionModal
              open={true}
              onOpenChange={(o) => {
                if (!o) setOptPickerState(null);
              }}
              title={`Choose ${optPickerState.progName}`}
              features={featuresOfType}
              maxSelections={optPickerState.total}
              initialSelectedNames={initialSelectedNames}
              characterSnapshot={characterSnapshot}
              className={viewingClass}
              onConfirm={(names) => {
                handleOptFeatureConfirm(names, optPickerState.featureTypes);
                setOptPickerState(null);
              }}
            />
          );
        })()}
      {asiPickerLevel !== null && (
        <AsiPickerDialog
          open={true}
          level={asiPickerLevel}
          existingChanges={
            appliedAsiChoicesForClass.find((ac) => ac.level === asiPickerLevel)
              ?.abilityChanges
          }
          onApply={(changes) => handleAsiApply(asiPickerLevel, changes)}
          onClose={() => setAsiPickerLevel(null)}
        />
      )}

      <FeatSelectionModal
        open={featPickerOpen}
        onOpenChange={setFeatPickerOpen}
        feats={featModalFeats}
        maxSelections={Math.max(totalFeatSlots, usedASI)}
        initialSelectedIds={(character.feats ?? []).map(
          (f) => `${f.name}|${f.source ?? ''}`,
        )}
        characterSnapshot={characterSnapshot}
        allowIgnoreLimit={false}
        onConfirm={handleFeatConfirm}
      />
    </div>
  );
}
