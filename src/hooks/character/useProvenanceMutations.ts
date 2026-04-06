import { useCallback } from 'react';
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers';
import {
  addGrant,
  applyBackgroundGrants,
  applyClassGrants,
  applyClassSpellGrant,
  applyFeatGrant,
  applyOptionalFeatureGrant,
  applyRaceGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileBackgroundChange,
  reconcileClassChange,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveChoice,
} from '@/lib/provenance';
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization';
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types';
import type { Character } from '@/types/character';

interface UseProvenanceMutationsParams {
  character: Character | null;
  ledger: ProvenanceLedger;
  patch: (newLedger: ProvenanceLedger) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
}

export function useProvenanceMutations({
  character,
  ledger,
  patch,
  updateCharacter,
}: UseProvenanceMutationsParams) {
  const applyRaceSelection = useCallback(
    (
      race: {
        name: string;
        source?: string;
        skillProficiencies?: unknown[];
        languageProficiencies?: unknown[];
        ability?: unknown[];
      },
      subrace?: {
        name: string;
        source?: string;
        skillProficiencies?: unknown[];
        languageProficiencies?: unknown[];
        ability?: unknown[];
        overwrite?: { ability?: boolean };
      },
    ) => {
      if (!character) return;
      let newLedger = reconcileRaceChange(
        ledger,
        character.race || undefined,
        character.subrace || undefined,
      );
      newLedger = applyRaceGrants(race, subrace, newLedger);
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const applySubraceChange = useCallback(
    (
      raceName: string,
      raceSource: string | undefined,
      subrace?: {
        name: string;
        source?: string;
        skillProficiencies?: unknown[];
        languageProficiencies?: unknown[];
        ability?: unknown[];
        overwrite?: { ability?: boolean };
      },
    ) => {
      if (!character) return;
      let newLedger = reconcileSubraceChange(
        ledger,
        character.subrace || undefined,
      );
      if (subrace) {
        newLedger = applyRaceGrants(
          {
            name: raceName,
            source: raceSource,
            skillProficiencies: [],
            languageProficiencies: [],
            ability: [],
          },
          subrace,
          newLedger,
        );
      }
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const applyClassSelection = useCallback(
    (
      cls: {
        name: string;
        source?: string;
        proficiency?: string[];
        startingProficiencies?: {
          armor?: string[];
          weapons?: string[];
          tools?: string[];
          toolProficiencies?: Record<
            string,
            number | boolean | { choose?: { from?: string[]; count?: number } }
          >[];
          skills?: { choose?: { from: string[]; count: number } };
        };
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return;

      const oldClassName = character.class || undefined;
      const oldSubclassName = character.subclass || undefined;

      let newLedger = reconcileClassChange(
        ledger,
        oldClassName,
        oldSubclassName,
      );
      newLedger = applyClassGrants(cls, subclass, newLedger);

      const updates: Partial<typeof character> = { provenance: newLedger };
      let newProfs = { ...character.proficiencies };

      if (oldClassName) {
        const domains = ['armor', 'weapons', 'tools', 'savingThrows'] as const;
        for (const domain of domains) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            'class',
            oldClassName,
          );
          if (domain === 'savingThrows') continue;
          if (toRemove.length > 0) {
            const cased =
              character.proficiencies[domain as 'armor' | 'weapons' | 'tools'];
            newProfs = {
              ...newProfs,
              [domain]: cased.filter(
                (name) => !toRemove.includes(normalizeKey(name)),
              ),
            };
          }
        }
      }

      const profs = cls.startingProficiencies ?? {};
      const isNarrativeTool = (value: string) =>
        /of your choice|choose|one type of/i.test(value);
      const toolsFromArray = (profs.tools ?? [])
        .filter((tool): tool is string => typeof tool === 'string')
        .map((tool) => stripItemTag(tool))
        .filter((tool) => tool && !isNarrativeTool(tool));
      const toolsFromBlocks = extractProficiencyBlockNames(
        profs.toolProficiencies ?? [],
        { includeAnyStandard: false },
      );
      newProfs = {
        ...newProfs,
        armor: [
          ...new Set([
            ...newProfs.armor,
            ...(profs.armor ?? [])
              .filter((armor): armor is string => typeof armor === 'string')
              .map((armor) => stripItemTag(armor)),
          ]),
        ],
        weapons: [
          ...new Set([
            ...newProfs.weapons,
            ...(profs.weapons ?? [])
              .filter((weapon): weapon is string => typeof weapon === 'string')
              .map((weapon) => stripItemTag(weapon)),
          ]),
        ],
        tools: [
          ...new Set([
            ...newProfs.tools,
            ...toolsFromArray,
            ...toolsFromBlocks,
          ]),
        ],
      };
      updates.proficiencies = newProfs;

      updateCharacter(character.id, updates);
    },
    [character, ledger, updateCharacter],
  );

  const applyBackgroundSelection = useCallback(
    (bg: {
      name: string;
      source?: string;
      skillProficiencies?: unknown[];
      languageProficiencies?: unknown[];
      toolProficiencies?: unknown[];
    }) => {
      if (!character) return;
      const oldBgName = character.background || undefined;

      let newLedger = reconcileBackgroundChange(ledger, oldBgName);
      newLedger = applyBackgroundGrants(bg, newLedger);

      let newProfs = { ...character.proficiencies };
      if (oldBgName) {
        for (const domain of ['languages', 'tools'] as const) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            'background',
            oldBgName,
          );
          if (toRemove.length > 0) {
            newProfs = {
              ...newProfs,
              [domain]: newProfs[domain].filter(
                (name) => !toRemove.includes(normalizeKey(name)),
              ),
            };
          }
        }
      }

      const languages: string[] = extractProficiencyBlockNames(
        bg.languageProficiencies ?? [],
        { includeAnyStandard: false },
      );
      const tools: string[] = extractProficiencyBlockNames(
        bg.toolProficiencies ?? [],
        { includeAnyStandard: false },
      );
      newProfs = {
        ...newProfs,
        languages: [...new Set([...newProfs.languages, ...languages])],
        tools: [...new Set([...newProfs.tools, ...tools])],
      };

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: newProfs,
      });
    },
    [character, ledger, updateCharacter],
  );

  const applySpellSelection = useCallback(
    (className: string, classSource: string | undefined, spellName: string) => {
      if (!character) return;
      const newLedger = applyClassSpellGrant(
        ledger,
        className,
        classSource,
        spellName,
        'choice',
      );
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const applyFeatSelection = useCallback(
    (featName: string, featSource: string | undefined) => {
      if (!character) return;
      const newLedger = applyFeatGrant(ledger, featName, featSource, true);
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const removeFeatProvenance = useCallback(
    (featName: string) => {
      if (!character) return;
      const normKey = normalizeKey(featName);
      const newFeats = { ...ledger.feats };
      delete newFeats[normKey];
      patch({ ...ledger, feats: newFeats });
    },
    [character, ledger, patch],
  );

  const replaceFeatSelections = useCallback(
    (selectedFeats: Array<{ name: string; source?: string }>) => {
      if (!character) return;
      const oldNames = new Set(
        (character.feats ?? []).map((feat) => feat.name),
      );
      const newNames = new Set(selectedFeats.map((feat) => feat.name));

      let newLedger = { ...ledger, feats: { ...ledger.feats } };
      for (const name of oldNames) {
        if (!newNames.has(name)) {
          const normKey = normalizeKey(name);
          delete newLedger.feats[normKey];
        }
      }
      for (const feat of selectedFeats) {
        if (!oldNames.has(feat.name)) {
          newLedger = applyFeatGrant(newLedger, feat.name, feat.source, true);
        }
      }

      updateCharacter(character.id, {
        feats: selectedFeats.map((feat) => ({
          id: `${feat.name}-${feat.source ?? ''}`,
          name: feat.name,
          source: feat.source ?? '',
          description: '',
        })),
        provenance: newLedger,
      });
    },
    [character, ledger, updateCharacter],
  );

  const applyOptionalFeatureSelection = useCallback(
    (
      featureName: string,
      featureSource: string | undefined,
      grantingSourceName: string,
      grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
    ) => {
      if (!character) return;
      const newLedger = applyOptionalFeatureGrant(
        ledger,
        featureName,
        featureSource,
        grantingSourceName,
        grantingSourceType,
      );
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const applyManualProficiencyToggle = useCallback(
    (
      domain:
        | 'skills'
        | 'languages'
        | 'tools'
        | 'armor'
        | 'weapons'
        | 'savingThrows',
      itemName: string,
      added: boolean,
    ) => {
      if (!character) return;
      if (added) {
        const tag = makeSourceTag('manual', 'User Choice', 'choice');
        patch(addGrant(ledger, domain, itemName, tag));
      } else {
        const normKey = normalizeKey(itemName);
        const map = ledger.proficiencies[domain];
        const filtered = (map[normKey] ?? []).filter(
          (tag) => tag.sourceType !== 'manual',
        );
        const newMap =
          filtered.length > 0
            ? { ...map, [normKey]: filtered }
            : Object.fromEntries(
                Object.entries(map).filter(([key]) => key !== normKey),
              );
        patch({
          ...ledger,
          proficiencies: { ...ledger.proficiencies, [domain]: newMap },
        });
      }
    },
    [character, ledger, patch],
  );

  const applyManualSpellGrant = useCallback(
    (spellName: string) => {
      if (!character) return;
      const tag = makeSourceTag('manual', 'User Choice', 'choice');
      patch(addGrant(ledger, 'spells', spellName, tag));
    },
    [character, ledger, patch],
  );

  const removeSpellProvenance = useCallback(
    (spellName: string) => {
      if (!character) return;
      const normKey = normalizeKey(spellName);
      const newSpells = { ...ledger.spells };
      delete newSpells[normKey];
      patch({ ...ledger, spells: newSpells });
    },
    [character, ledger, patch],
  );

  const applyManualEquipmentGrant = useCallback(
    (itemName: string) => {
      if (!character) return;
      const tag = makeSourceTag('manual', 'User Choice', 'choice');
      patch(addGrant(ledger, 'equipment', itemName, tag));
    },
    [character, ledger, patch],
  );

  const removeEquipmentProvenance = useCallback(
    (itemName: string) => {
      if (!character) return;
      const normKey = normalizeKey(itemName);
      const newEquipment = { ...ledger.equipment };
      delete newEquipment[normKey];
      patch({ ...ledger, equipment: newEquipment });
    },
    [character, ledger, patch],
  );

  const resolveChoiceSelection = useCallback(
    (
      domain: Extract<
        ChoiceDomain,
        'skills' | 'languages' | 'tools' | 'armor' | 'weapons'
      >,
      itemName: string,
      adding: boolean,
      choiceId?: string,
    ) => {
      if (!character) return;
      const normKey = normalizeKey(itemName);

      if (adding) {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.length < choice.chooseCount,
            )
          : ledger.choices.find(
              (choice) =>
                choice.domain === domain &&
                choice.selected.length < choice.chooseCount &&
                (choice.optionPool.length === 0 ||
                  choice.optionPool.some(
                    (poolEntry) => normalizeKey(poolEntry) === normKey,
                  )),
            );
        if (!matchingChoice) return;

        const newSelected = [...matchingChoice.selected, itemName];
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected);
        const tag = makeSourceTag(
          matchingChoice.sourceTag.sourceType,
          matchingChoice.sourceTag.sourceName,
          'choice',
          matchingChoice.sourceTag.sourceRef,
        );
        newLedger = addGrant(newLedger, domain, itemName, tag);

        if (domain === 'skills') {
          updateCharacter(character.id, {
            provenance: newLedger,
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {
                  bonus: 0,
                  expertise: false,
                }),
                proficient: true,
              },
            },
          });
        } else {
          const profDomain = domain as
            | 'armor'
            | 'weapons'
            | 'tools'
            | 'languages';
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: [
                ...new Set([...character.proficiencies[profDomain], itemName]),
              ],
            },
          });
        }
      } else {
        const matchingChoice = choiceId
          ? ledger.choices.find(
              (choice) =>
                choice.id === choiceId &&
                choice.domain === domain &&
                choice.selected.some(
                  (selected) => normalizeKey(selected) === normKey,
                ),
            )
          : ledger.choices.find(
              (choice) =>
                choice.domain === domain &&
                choice.selected.some(
                  (selected) => normalizeKey(selected) === normKey,
                ),
            );
        if (!matchingChoice) return;

        const newSelected = matchingChoice.selected.filter(
          (selected) => normalizeKey(selected) !== normKey,
        );
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected);

        const map = newLedger.proficiencies[
          domain as keyof typeof newLedger.proficiencies
        ] as Record<string, import('@/lib/provenance/types').SourceTag[]>;
        if (map) {
          const tags = map[normKey] ?? [];
          const filtered = tags.filter(
            (tag) =>
              !(
                tag.grantType === 'choice' &&
                tag.sourceName === matchingChoice.sourceTag.sourceName
              ),
          );
          const newMap =
            filtered.length > 0
              ? { ...map, [normKey]: filtered }
              : Object.fromEntries(
                  Object.entries(map).filter(([key]) => key !== normKey),
                );
          newLedger = {
            ...newLedger,
            proficiencies: { ...newLedger.proficiencies, [domain]: newMap },
          };
        }

        if (domain === 'skills') {
          updateCharacter(character.id, {
            provenance: newLedger,
            skills: {
              ...(character.skills ?? {}),
              [normKey]: {
                ...(character.skills?.[normKey] ?? {}),
                proficient: false,
                expertise: false,
              },
            },
          });
        } else {
          const profDomain = domain as
            | 'armor'
            | 'weapons'
            | 'tools'
            | 'languages';
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              [profDomain]: character.proficiencies[profDomain].filter(
                (proficiency) => normalizeKey(proficiency) !== normKey,
              ),
            },
          });
        }
      }
    },
    [character, ledger, updateCharacter],
  );

  return {
    applyRaceSelection,
    applySubraceChange,
    applyClassSelection,
    applyBackgroundSelection,
    applySpellSelection,
    applyFeatSelection,
    removeFeatProvenance,
    replaceFeatSelections,
    applyOptionalFeatureSelection,
    applyManualProficiencyToggle,
    applyManualSpellGrant,
    removeSpellProvenance,
    applyManualEquipmentGrant,
    removeEquipmentProvenance,
    resolveChoiceSelection,
  };
}
