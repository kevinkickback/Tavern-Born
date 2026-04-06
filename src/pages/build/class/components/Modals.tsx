import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal';
import { OptionalFeatureSelectionModal } from '@/components/modals/OptionalFeatureSelectionModal';
import type {
  ActiveFilters,
  CategoryLimit,
} from '@/components/modals/SelectionModal';
import { SpellSelectionModal } from '@/components/modals/SpellSelectionModal';
import { SubclassSelectionModal } from '@/components/modals/SubclassSelectionModal';
import {
  getFeatureTypes,
  type OptionalFeatureLike,
} from '@/lib/5etools/classData';
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites';
import { getOrdinalForm } from '@/lib/calculations/spellUtils';
import { AsiPickerDialog } from '@/pages/build/class/components/AsiPickerDialog';
import { ClassSelectionDialog } from '@/pages/build/class/components/ClassSelectionDialog';
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools';
import type { AsiChoice, Character } from '@/types/character';

interface SubclassOption {
  name: string;
  source?: string;
  shortName?: string;
  entries?: unknown[];
  levelFeatures?: {
    level: number;
    features: { name: string; source?: string; entries?: unknown[] }[];
  }[];
}

interface OptPickerState {
  progName: string;
  featureTypes: string[];
  total: number;
}

interface ClassFeatPickerState {
  progName: string;
  categories: string[];
  total: number;
}

type OptionalFeatureModalOption = {
  name: string;
  source?: string;
  entries?: unknown[];
  [extra: string]: unknown;
};

interface BuildClassModalsProps {
  character: Character;
  classes: Class5e[];
  classPickerOpen: boolean;
  classPickerSearch: string;
  onClassPickerOpenChange: (open: boolean) => void;
  onClassPickerSearchChange: (search: string) => void;
  onClassSelect: (className: string, classSource?: string) => void;

  spellPickerLevel: number | null;
  onSpellPickerLevelChange: (level: number | null) => void;
  spellChoicesByLevel: Map<
    number,
    {
      cantrips: number;
      spells: number;
      maxSpellLevel: number;
    }
  >;
  classSpells: Spell5e[];
  spellByName: Map<string, Spell5e>;
  viewingClass?: string;
  viewingClassSource?: string;
  onApplySpellSelection: (
    className: string,
    classSource: string | undefined,
    spellName: string,
  ) => void;
  onUpdateCharacter: (patch: Partial<Character>) => void;

  subclassPickerOpen: boolean;
  onSubclassPickerOpenChange: (open: boolean) => void;
  subclassTitle: string;
  subclasses: SubclassOption[];
  viewingSubclass?: string;
  onSubclassConfirm: (subclass: SubclassOption) => void;

  optPickerState: OptPickerState | null;
  onOptPickerStateChange: (state: OptPickerState | null) => void;
  optFeatures: OptionalFeatureLike[];
  characterSnapshot: PrereqCharacterSnapshot;
  onOptFeatureConfirm: (names: string[], featureTypes: string[]) => void;

  asiPickerLevel: number | null;
  onAsiPickerLevelChange: (level: number | null) => void;
  appliedAsiChoicesForClass: AsiChoice[];
  onAsiApply: (level: number, changes: Record<string, 1 | 2>) => void;

  featPickerOpen: boolean;
  onFeatPickerOpenChange: (open: boolean) => void;
  featModalFeats: Feat5e[];
  totalFeatSlots: number;
  usedASI: number;
  onFeatConfirm: (selectedFeats: Feat5e[]) => void;

  classFeatPickerState: ClassFeatPickerState | null;
  onClassFeatPickerStateChange: (state: ClassFeatPickerState | null) => void;
  feats: Feat5e[];
  featByCompositeId: Map<string, Feat5e>;
}

export function BuildClassModals({
  character,
  classes,
  classPickerOpen,
  classPickerSearch,
  onClassPickerOpenChange,
  onClassPickerSearchChange,
  onClassSelect,
  spellPickerLevel,
  onSpellPickerLevelChange,
  spellChoicesByLevel,
  classSpells,
  spellByName,
  viewingClass,
  viewingClassSource,
  onApplySpellSelection,
  onUpdateCharacter,
  subclassPickerOpen,
  onSubclassPickerOpenChange,
  subclassTitle,
  subclasses,
  viewingSubclass,
  onSubclassConfirm,
  optPickerState,
  onOptPickerStateChange,
  optFeatures,
  characterSnapshot,
  onOptFeatureConfirm,
  asiPickerLevel,
  onAsiPickerLevelChange,
  appliedAsiChoicesForClass,
  onAsiApply,
  featPickerOpen,
  onFeatPickerOpenChange,
  featModalFeats,
  totalFeatSlots,
  usedASI,
  onFeatConfirm,
  classFeatPickerState,
  onClassFeatPickerStateChange,
  feats,
  featByCompositeId,
}: BuildClassModalsProps) {
  return (
    <>
      <ClassSelectionDialog
        open={classPickerOpen}
        classes={classes}
        search={classPickerSearch}
        selectedClassName={character.class}
        selectedClassSource={character.classSource}
        onOpenChange={(open) => {
          onClassPickerOpenChange(open);
          if (!open) onClassPickerSearchChange('');
        }}
        onSearchChange={onClassPickerSearchChange}
        onClassSelect={onClassSelect}
      />

      {spellPickerLevel !== null &&
        (() => {
          const gain = spellChoicesByLevel.get(spellPickerLevel);
          if (!gain) return null;

          const ownedNames = new Set([
            ...(character.spells?.cantrips ?? []),
            ...(character.spells?.spellsKnown ?? []),
          ]);

          const categories: CategoryLimit<Spell5e>[] = [];
          if (gain.cantrips > 0) {
            categories.push({
              key: 'cantrips',
              label: 'cantrips',
              max: gain.cantrips,
              test: (spell) => spell.level === 0,
            });
          }
          if (gain.spells > 0) {
            categories.push({
              key: 'spells',
              label:
                gain.maxSpellLevel > 0
                  ? `<=${getOrdinalForm(gain.maxSpellLevel)} spells`
                  : 'spells',
              max: gain.spells,
              test: (spell) =>
                spell.level > 0 &&
                (gain.maxSpellLevel === 0 || spell.level <= gain.maxSpellLevel),
            });
          }

          const title = [
            gain.cantrips > 0 &&
              `Learn ${gain.cantrips} cantrip${gain.cantrips > 1 ? 's' : ''}`,
            `${gain.spells} spell${gain.spells > 1 ? 's' : ''}${gain.maxSpellLevel > 0 ? ` (up to ${getOrdinalForm(gain.maxSpellLevel)}-level)` : ''}`,
          ]
            .filter(Boolean)
            .join(' · ');

          const levelValues: string[] = [];
          if (gain.cantrips > 0) levelValues.push('0');
          if (gain.spells > 0 && gain.maxSpellLevel > 0) {
            for (let i = 1; i <= gain.maxSpellLevel; i++) {
              levelValues.push(String(i));
            }
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
              onOpenChange={(open) => {
                if (!open) onSpellPickerLevelChange(null);
              }}
              title={title}
              spells={classSpells}
              ownedNames={ownedNames}
              categories={categories}
              initialFilters={initialFilters}
              allowedLevels={allowedLevels}
              onConfirm={(names) => {
                const newCantrips = names.filter(
                  (name) => spellByName.get(name)?.level === 0,
                );
                const newKnown = names.filter(
                  (name) => spellByName.get(name)?.level !== 0,
                );

                onUpdateCharacter({
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
                  if (viewingClass) {
                    onApplySpellSelection(
                      viewingClass,
                      viewingClassSource,
                      name,
                    );
                  }
                }
                onSpellPickerLevelChange(null);
              }}
            />
          );
        })()}

      {subclassPickerOpen && (
        <SubclassSelectionModal
          open={subclassPickerOpen}
          onOpenChange={onSubclassPickerOpenChange}
          title={`Choose ${subclassTitle}`}
          subclasses={subclasses}
          selectedName={viewingSubclass ?? undefined}
          onConfirm={onSubclassConfirm}
        />
      )}

      {optPickerState &&
        (() => {
          const featuresOfType = optFeatures.filter((feature) => {
            const featureTypes = getFeatureTypes(feature);
            return optPickerState.featureTypes.some((type) =>
              featureTypes.includes(type),
            );
          });

          const initialSelectedNames = character.features
            .filter((feature) =>
              featuresOfType.some((of) => of.name === feature.name),
            )
            .map((feature) => feature.name);

          const modalFeatures: OptionalFeatureModalOption[] =
            featuresOfType.map((feature) => ({ ...feature }));

          return (
            <OptionalFeatureSelectionModal
              open={true}
              onOpenChange={(open) => {
                if (!open) onOptPickerStateChange(null);
              }}
              title={`Choose ${optPickerState.progName}`}
              features={modalFeatures}
              maxSelections={optPickerState.total}
              initialSelectedNames={initialSelectedNames}
              characterSnapshot={characterSnapshot}
              className={viewingClass}
              onConfirm={(names) => {
                onOptFeatureConfirm(names, optPickerState.featureTypes);
                onOptPickerStateChange(null);
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
          onApply={(changes) => onAsiApply(asiPickerLevel, changes)}
          onClose={() => onAsiPickerLevelChange(null)}
        />
      )}

      <FeatSelectionModal
        open={featPickerOpen}
        onOpenChange={onFeatPickerOpenChange}
        feats={featModalFeats}
        maxSelections={Math.max(totalFeatSlots, usedASI)}
        initialSelectedIds={(character.feats ?? []).map(
          (feat) => `${feat.name}|${feat.source ?? ''}`,
        )}
        characterSnapshot={characterSnapshot}
        allowIgnoreLimit={false}
        onConfirm={onFeatConfirm}
      />

      {classFeatPickerState &&
        (() => {
          const categorySet = new Set(classFeatPickerState.categories);
          const available = feats.filter(
            (feat) => !!feat.category && categorySet.has(feat.category),
          );
          const availableIds = new Set(
            available.map((feat) => `${feat.name}|${feat.source ?? ''}`),
          );
          const savedInCategory = (character.specialFeats ?? []).filter(
            (specialFeat) => {
              const feat = featByCompositeId.get(
                `${specialFeat.name}|${specialFeat.source ?? ''}`,
              );
              return !!feat?.category && categorySet.has(feat.category);
            },
          );
          const savedNotInList = savedInCategory
            .filter(
              (specialFeat) =>
                !availableIds.has(
                  `${specialFeat.name}|${specialFeat.source ?? ''}`,
                ),
            )
            .map(
              (specialFeat) =>
                ({
                  name: specialFeat.name,
                  source: specialFeat.source,
                  entries: [],
                }) as Feat5e,
            );

          const modalFeats = [...available, ...savedNotInList];

          return (
            <FeatSelectionModal
              open={true}
              onOpenChange={(open) => {
                if (!open) onClassFeatPickerStateChange(null);
              }}
              feats={modalFeats}
              maxSelections={classFeatPickerState.total}
              initialSelectedIds={savedInCategory.map(
                (feat) => `${feat.name}|${feat.source ?? ''}`,
              )}
              initialFilters={{
                limit: new Set(),
                featCategory: new Set(),
                prereq: new Set(['showUnmet']),
              }}
              characterSnapshot={characterSnapshot}
              allowIgnoreLimit={false}
              onConfirm={(selectedFeats) => {
                const keptSpecial = (character.specialFeats ?? []).filter(
                  (specialFeat) => {
                    const feat = featByCompositeId.get(
                      `${specialFeat.name}|${specialFeat.source ?? ''}`,
                    );
                    return !feat?.category || !categorySet.has(feat.category);
                  },
                );

                const newSpecial = selectedFeats.map((feat) => ({
                  id: `${feat.name}-${feat.source ?? ''}`,
                  name: feat.name,
                  source: feat.source ?? '',
                  description: '',
                }));

                onUpdateCharacter({
                  specialFeats: [...keptSpecial, ...newSpecial],
                });
                onClassFeatPickerStateChange(null);
              }}
            />
          );
        })()}
    </>
  );
}
