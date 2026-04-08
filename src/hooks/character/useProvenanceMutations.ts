import { useCallback } from 'react';
import { extractProficiencyBlockNames } from '@/lib/5etools/parsers';
import {
  resolveBackgroundStartingEquipmentPackage,
  resolveClassStartingEquipment,
} from '@/lib/5etools/startingEquipment';
import {
  getBackgroundAbilityData,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores';
import {
  addAbilityBonus,
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
import type { Item5e } from '@/types/5etools';
import type { Character } from '@/types/character';

const CURRENCY_KEYS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;

interface UseProvenanceMutationsParams {
  character: Character | null;
  ledger: ProvenanceLedger;
  itemLookup: Map<string, Item5e>;
  patch: (newLedger: ProvenanceLedger) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
}

const SAVING_THROW_NAME_BY_KEY: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name);
  return SAVING_THROW_NAME_BY_KEY[normalized] ?? normalized;
}

function generateEquipmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function removeSourceGrantedEquipment(
  equipment: Character['equipment'],
  sourceNames: string[],
): Character['equipment'] {
  if (sourceNames.length === 0) return equipment;
  return equipment.filter(
    (item) => !sourceNames.includes(normalizeKey(item.name)),
  );
}

function upsertGrantedEquipment(
  equipment: Character['equipment'],
  granted: Array<
    Omit<Character['equipment'][number], 'id' | 'equipped' | 'attuned'>
  >,
): Character['equipment'] {
  const next = [...equipment];

  for (const item of granted) {
    const existingIndex = next.findIndex(
      (eq) =>
        normalizeKey(eq.name) === normalizeKey(item.name) &&
        normalizeKey(eq.source ?? '') === normalizeKey(item.source ?? ''),
    );

    if (existingIndex === -1) {
      next.push({
        id: generateEquipmentId(),
        equipped: false,
        attuned: false,
        ...item,
      });
      continue;
    }

    const existing = next[existingIndex];
    next[existingIndex] = {
      ...existing,
      quantity: existing.quantity + item.quantity,
      type: existing.type || item.type,
      ac: existing.ac ?? item.ac,
      armorType: existing.armorType ?? item.armorType,
      weight: existing.weight ?? item.weight,
      value: existing.value ?? item.value,
      rarity: existing.rarity ?? item.rarity,
      reqAttune: existing.reqAttune ?? item.reqAttune,
    };
  }

  return next;
}

export function useProvenanceMutations({
  character,
  ledger,
  itemLookup,
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
      const oldRaceName = character.race || undefined;
      const oldSubraceName = character.subrace || undefined;
      let newLedger = reconcileRaceChange(ledger, oldRaceName, oldSubraceName);
      newLedger = applyRaceGrants(race, subrace, newLedger);

      let nextProficiencies = { ...character.proficiencies };
      const nextSkills = { ...(character.skills ?? {}) };

      for (const [sourceType, sourceName] of [
        ['race', oldRaceName],
        ['subrace', oldSubraceName],
      ] as const) {
        if (!sourceName) continue;
        for (const domain of ['skills', 'languages'] as const) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            sourceType,
            sourceName,
          );
          if (toRemove.length === 0) continue;

          nextProficiencies = {
            ...nextProficiencies,
            [domain]: nextProficiencies[domain].filter(
              (name) => !toRemove.includes(normalizeKey(name)),
            ),
          };

          if (domain === 'skills') {
            for (const removed of toRemove) {
              const existing = nextSkills[removed];
              nextSkills[removed] = {
                proficient: false,
                expertise: false,
                bonus: existing?.bonus ?? 0,
              };
            }
          }
        }
      }

      const raceSkills = extractProficiencyBlockNames(
        race.skillProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));
      const raceLanguages = extractProficiencyBlockNames(
        race.languageProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));
      const subraceSkills = extractProficiencyBlockNames(
        subrace?.skillProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));
      const subraceLanguages = extractProficiencyBlockNames(
        subrace?.languageProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));

      nextProficiencies = {
        ...nextProficiencies,
        skills: [
          ...new Set([
            ...nextProficiencies.skills,
            ...raceSkills.map(normalizeKey),
            ...subraceSkills.map(normalizeKey),
          ]),
        ],
        languages: [
          ...new Set([
            ...nextProficiencies.languages,
            ...raceLanguages,
            ...subraceLanguages,
          ]),
        ],
      };

      for (const skillName of [...raceSkills, ...subraceSkills]) {
        const normalized = normalizeKey(skillName);
        const existing = nextSkills[normalized];
        nextSkills[normalized] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        };
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: nextProficiencies,
        skills: nextSkills,
      });
    },
    [character, ledger, updateCharacter],
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
      const oldSubraceName = character.subrace || undefined;
      let newLedger = reconcileSubraceChange(ledger, oldSubraceName);
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

      let nextProficiencies = { ...character.proficiencies };
      const nextSkills = { ...(character.skills ?? {}) };

      if (oldSubraceName) {
        for (const domain of ['skills', 'languages'] as const) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            'subrace',
            oldSubraceName,
          );
          if (toRemove.length === 0) continue;

          nextProficiencies = {
            ...nextProficiencies,
            [domain]: nextProficiencies[domain].filter(
              (name) => !toRemove.includes(normalizeKey(name)),
            ),
          };

          if (domain === 'skills') {
            for (const removed of toRemove) {
              const existing = nextSkills[removed];
              nextSkills[removed] = {
                proficient: false,
                expertise: false,
                bonus: existing?.bonus ?? 0,
              };
            }
          }
        }
      }

      const subraceSkills = extractProficiencyBlockNames(
        subrace?.skillProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));
      const subraceLanguages = extractProficiencyBlockNames(
        subrace?.languageProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));

      nextProficiencies = {
        ...nextProficiencies,
        skills: [
          ...new Set([
            ...nextProficiencies.skills,
            ...subraceSkills.map(normalizeKey),
          ]),
        ],
        languages: [
          ...new Set([...nextProficiencies.languages, ...subraceLanguages]),
        ],
      };

      for (const skillName of subraceSkills) {
        const normalized = normalizeKey(skillName);
        const existing = nextSkills[normalized];
        nextSkills[normalized] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        };
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: nextProficiencies,
        skills: nextSkills,
      });
    },
    [character, ledger, updateCharacter],
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
      const newSkills = { ...(character.skills ?? {}) };
      let newEquipment = [...(character.equipment ?? [])];

      if (oldClassName) {
        const domains = ['armor', 'weapons', 'tools', 'savingThrows'] as const;
        for (const domain of domains) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            'class',
            oldClassName,
          );
          if (toRemove.length > 0) {
            if (domain === 'savingThrows') {
              newProfs = {
                ...newProfs,
                savingThrows: newProfs.savingThrows.filter(
                  (name) => !toRemove.includes(normalizeSavingThrowName(name)),
                ),
              };
            } else {
              const cased =
                character.proficiencies[
                  domain as 'armor' | 'weapons' | 'tools'
                ];
              newProfs = {
                ...newProfs,
                [domain]: cased.filter(
                  (name) => !toRemove.includes(normalizeKey(name)),
                ),
              };
            }
          }
        }

        const classEquipmentToRemove = Object.entries(ledger.equipment)
          .filter(
            ([, tags]) =>
              tags.length > 0 &&
              tags.every(
                (tag) =>
                  tag.sourceType === 'class' && tag.sourceName === oldClassName,
              ),
          )
          .map(([name]) => name);
        newEquipment = removeSourceGrantedEquipment(
          newEquipment,
          classEquipmentToRemove,
        );
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
        savingThrows: [
          ...new Set([
            ...newProfs.savingThrows,
            ...(cls.proficiency ?? []).map(normalizeSavingThrowName),
          ]),
        ],
      };
      updates.proficiencies = newProfs;
      updates.skills = newSkills;
      const classEquipment = resolveClassStartingEquipment(
        cls.startingEquipment,
        itemLookup,
      );
      updates.equipment = upsertGrantedEquipment(newEquipment, classEquipment);

      updateCharacter(character.id, updates);
    },
    [character, ledger, updateCharacter, itemLookup],
  );

  const applyBackgroundSelection = useCallback(
    (
      bg: {
        name: string;
        source?: string;
        skillProficiencies?: unknown[];
        languageProficiencies?: unknown[];
        toolProficiencies?: unknown[];
        startingEquipment?: unknown;
      },
      preferredOption: 'a' | 'b' = 'a',
    ) => {
      if (!character) return;
      const oldBgName = character.background || undefined;

      let newLedger = reconcileBackgroundChange(ledger, oldBgName);
      newLedger = applyBackgroundGrants(bg, newLedger);

      let newProfs = { ...character.proficiencies };
      const newSkills = { ...(character.skills ?? {}) };
      let newEquipment = [...(character.equipment ?? [])];
      if (oldBgName) {
        for (const domain of ['skills', 'languages', 'tools'] as const) {
          const { toRemove } = diffProficiencyGrants(
            ledger,
            domain,
            'background',
            oldBgName,
          );
          if (toRemove.length > 0) {
            if (domain === 'skills') {
              newProfs = {
                ...newProfs,
                skills: (newProfs.skills ?? []).filter(
                  (name) => !toRemove.includes(normalizeKey(name)),
                ),
              };
              for (const removed of toRemove) {
                const existing = newSkills[removed];
                newSkills[removed] = {
                  proficient: false,
                  expertise: false,
                  bonus: existing?.bonus ?? 0,
                };
              }
              continue;
            }
            newProfs = {
              ...newProfs,
              [domain]: newProfs[domain].filter(
                (name) => !toRemove.includes(normalizeKey(name)),
              ),
            };
          }
        }

        const backgroundEquipmentToRemove = Object.entries(ledger.equipment)
          .filter(
            ([, tags]) =>
              tags.length > 0 &&
              tags.every(
                (tag) =>
                  tag.sourceType === 'background' &&
                  tag.sourceName === oldBgName,
              ),
          )
          .map(([name]) => name);
        newEquipment = removeSourceGrantedEquipment(
          newEquipment,
          backgroundEquipmentToRemove,
        );
      }

      const skills: string[] = extractProficiencyBlockNames(
        bg.skillProficiencies ?? [],
        { includeAnyStandard: false },
      ).filter((name) => !name.toLowerCase().startsWith('choose '));
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
        skills: [...new Set([...(newProfs.skills ?? []), ...skills])],
        languages: [...new Set([...newProfs.languages, ...languages])],
        tools: [...new Set([...newProfs.tools, ...tools])],
      };

      for (const skillName of skills) {
        const norm = normalizeKey(skillName);
        const existing = newSkills[norm];
        newSkills[norm] = {
          proficient: true,
          expertise: existing?.expertise ?? false,
          bonus: existing?.bonus ?? 0,
        };
      }

      const resolvedBackgroundPackage =
        resolveBackgroundStartingEquipmentPackage(
          bg.startingEquipment,
          itemLookup,
          preferredOption,
        );

      const previousBackgroundCurrency = character.backgroundCurrencyGrant;
      const nextCurrency = {
        cp: character.currency?.cp ?? 0,
        sp: character.currency?.sp ?? 0,
        ep: character.currency?.ep ?? 0,
        gp: character.currency?.gp ?? 0,
        pp: character.currency?.pp ?? 0,
      };

      if (previousBackgroundCurrency) {
        for (const key of CURRENCY_KEYS) {
          nextCurrency[key] = Math.max(
            0,
            nextCurrency[key] - (previousBackgroundCurrency[key] ?? 0),
          );
        }
      }

      for (const key of CURRENCY_KEYS) {
        nextCurrency[key] += resolvedBackgroundPackage.currency[key] ?? 0;
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: newProfs,
        skills: newSkills,
        equipment: upsertGrantedEquipment(
          newEquipment,
          resolvedBackgroundPackage.items,
        ),
        currency: nextCurrency,
        backgroundCurrencyGrant: resolvedBackgroundPackage.currency,
        backgroundEquipmentChoice: preferredOption,
      });
    },
    [character, ledger, updateCharacter, itemLookup],
  );

  const applySpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel?: number,
    ) => {
      if (!character) return;
      const newLedger = applyClassSpellGrant(
        ledger,
        className,
        classSource,
        spellName,
        'choice',
        {
          ...(grantedAtLevel ? { spellGrantedAtLevel: grantedAtLevel } : {}),
          spellAttributionMode: grantedAtLevel ? 'exact' : undefined,
        },
      );
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  const applyInferredClassSpellSelection = useCallback(
    (
      className: string,
      classSource: string | undefined,
      spellName: string,
      grantedAtLevel: number,
    ) => {
      if (!character) return;
      const newLedger = applyClassSpellGrant(
        ledger,
        className,
        classSource,
        spellName,
        'choice',
        {
          spellGrantedAtLevel: grantedAtLevel,
          spellAttributionMode: 'inferred-lowest-eligible',
        },
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
          const nextSkillProficiencies = [
            ...new Set([
              ...(character.proficiencies.skills ?? []),
              normalizeKey(itemName),
            ]),
          ];
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
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
          const nextSkillProficiencies = (
            character.proficiencies.skills ?? []
          ).filter((proficiency) => normalizeKey(proficiency) !== normKey);
          updateCharacter(character.id, {
            provenance: newLedger,
            proficiencies: {
              ...character.proficiencies,
              skills: nextSkillProficiencies,
            },
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

  /**
   * Apply (or update) the player's background ability score choices.
   * Replaces any existing background ability bonus records in the ledger.
   * Writes new records derived from the chosen block + ordered selections.
   */
  const applyBackgroundAbilityChoices = useCallback(
    (
      bg: { name: string; source?: string; ability?: unknown[] },
      blockIndex: number,
      choices: string[],
    ) => {
      if (!character) return;
      const bgData = getBackgroundAbilityData(bg);
      const block = bgData.blocks[blockIndex];
      if (!block) return;

      // Remove stale background ability bonus records
      const cleanedBonuses = ledger.abilityBonuses.filter(
        (r) =>
          !(
            r.sourceTag.sourceType === 'background' &&
            r.sourceTag.sourceName === bg.name
          ),
      );
      let newLedger: ProvenanceLedger = {
        ...ledger,
        abilityBonuses: cleanedBonuses,
      };

      const bgTag = makeSourceTag('background', bg.name, 'choice', bg.source);
      const seen = new Set<string>();
      for (let i = 0; i < block.weights.length; i++) {
        const ability = normalizeAbilityName(choices[i] ?? '');
        if (!ability || seen.has(ability)) continue;
        seen.add(ability);
        newLedger = addAbilityBonus(newLedger, {
          ability,
          value: block.weights[i],
          sourceTag: bgTag,
        });
      }

      updateCharacter(character.id, {
        provenance: newLedger,
        backgroundAsiBlockIndex: blockIndex,
        backgroundAsiChoices: choices,
      });
    },
    [character, ledger, updateCharacter],
  );

  return {
    applyRaceSelection,
    applySubraceChange,
    applyClassSelection,
    applyBackgroundSelection,
    applyBackgroundAbilityChoices,
    applySpellSelection,
    applyInferredClassSpellSelection,
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
