import { useCallback, useMemo } from 'react';
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
  getAbilityBonusRows,
  getAllProficiencyRows,
  getEquipmentRows,
  getFeatRows,
  getFeatureRows,
  getSpellRows,
  makeSourceTag,
  reconcileBackgroundChange,
  reconcileClassChange,
  reconcileRaceChange,
  reconcileSubraceChange,
  resolveChoice,
} from '@/lib/provenance';
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization';
import type {
  ChoiceDomain,
  ProvenanceLedger,
  SourceRow,
  SourceType,
} from '@/lib/provenance/types';
import {
  getCollapseState,
  setCollapseState,
} from '@/lib/storage/collapseState';
import { emptyProvenance, useCharacterStore } from '@/store/characterStore';
import type { Character } from '@/types/character';

function getLedger(character: Character | null): ProvenanceLedger {
  return character?.provenance ?? emptyProvenance();
}

export function useProvenance() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const ledger = useMemo(
    () => getLedger(character),
    [character?.provenance, character],
  );

  const patch = useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character) return;
      updateCharacter(character.id, { provenance: newLedger });
    },
    [character, updateCharacter],
  );

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
        // Re-apply race to get its base grants (they weren't cleared), then layer subrace
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
          skills?: { choose?: { from: string[]; count: number } };
        };
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return;

      // Determine previous class to reconcile (only remove primary class grants)
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

      // Remove items exclusively attributed to the old class
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

      // Add new class fixed proficiencies — always, not only on class switch
      const profs = cls.startingProficiencies ?? {};
      const isNarrativeTool = (s: string) =>
        /of your choice|choose|one type of/i.test(s);
      const toolsFromArray = (profs.tools ?? [])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => stripItemTag(t))
        .filter((t) => t && !isNarrativeTool(t));
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
              .filter((a): a is string => typeof a === 'string')
              .map((a) => stripItemTag(a)),
          ]),
        ],
        weapons: [
          ...new Set([
            ...newProfs.weapons,
            ...(profs.weapons ?? [])
              .filter((w): w is string => typeof w === 'string')
              .map((w) => stripItemTag(w)),
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

      // Reconcile language/tool arrays: remove items exclusively from old background
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

      // Add new background proficiencies
      const langs: string[] = extractProficiencyBlockNames(
        bg.languageProficiencies ?? [],
        { includeAnyStandard: false },
      );
      const tools: string[] = extractProficiencyBlockNames(
        bg.toolProficiencies ?? [],
        { includeAnyStandard: false },
      );
      newProfs = {
        ...newProfs,
        languages: [...new Set([...newProfs.languages, ...langs])],
        tools: [...new Set([...newProfs.tools, ...tools])],
      };

      updateCharacter(character.id, {
        provenance: newLedger,
        proficiencies: newProfs,
      });
    },
    [character, ledger, updateCharacter],
  );

  /** Record a spell as chosen from a class level (user pick). */
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

  /** Record feat addition with provenance. */
  const applyFeatSelection = useCallback(
    (featName: string, featSource: string | undefined) => {
      if (!character) return;
      const newLedger = applyFeatGrant(ledger, featName, featSource, true);
      patch(newLedger);
    },
    [character, ledger, patch],
  );

  /** Remove feat from provenance ledger. */
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

  /** Replace the entire feats selection atomically (feats array + provenance in one update). */
  const replaceFeatSelections = useCallback(
    (selectedFeats: Array<{ name: string; source?: string }>) => {
      if (!character) return;
      const oldNames = new Set((character.feats ?? []).map((f) => f.name));
      const newNames = new Set(selectedFeats.map((f) => f.name));

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
        feats: selectedFeats.map((f) => ({
          id: `${f.name}-${f.source ?? ''}`,
          name: f.name,
          source: f.source ?? '',
          description: '',
        })),
        provenance: newLedger,
      });
    },
    [character, ledger, updateCharacter],
  );

  /** Record optional feature selection with provenance. */
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

  /** Record a manual proficiency toggle as 'User Choice'. */
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
        // Remove the manual tag; if no other tags remain, key is pruned by removeGrantsBySourceFromDomain
        const normKey = normalizeKey(itemName);
        const map = ledger.proficiencies[domain];
        const filtered = (map[normKey] ?? []).filter(
          (t) => t.sourceType !== 'manual',
        );
        const newMap =
          filtered.length > 0
            ? { ...map, [normKey]: filtered }
            : Object.fromEntries(
                Object.entries(map).filter(([k]) => k !== normKey),
              );
        patch({
          ...ledger,
          proficiencies: { ...ledger.proficiencies, [domain]: newMap },
        });
      }
    },
    [character, ledger, patch],
  );

  /** Record a spell addition with a manual 'User Choice' tag. */
  const applyManualSpellGrant = useCallback(
    (spellName: string) => {
      if (!character) return;
      const tag = makeSourceTag('manual', 'User Choice', 'choice');
      patch(addGrant(ledger, 'spells', spellName, tag));
    },
    [character, ledger, patch],
  );

  /** Remove a spell from provenance. */
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

  /** Record manual equipment addition. */
  const applyManualEquipmentGrant = useCallback(
    (itemName: string) => {
      if (!character) return;
      const tag = makeSourceTag('manual', 'User Choice', 'choice');
      patch(addGrant(ledger, 'equipment', itemName, tag));
    },
    [character, ledger, patch],
  );

  /** Remove equipment from provenance. */
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

  /** Resolve a user's choice selection for a proficiency domain choice slot. */
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
              (c) =>
                c.id === choiceId &&
                c.domain === domain &&
                c.selected.length < c.chooseCount,
            )
          : ledger.choices.find(
              (c) =>
                c.domain === domain &&
                c.selected.length < c.chooseCount &&
                (c.optionPool.length === 0 ||
                  c.optionPool.some((p) => normalizeKey(p) === normKey)),
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
              (c) =>
                c.id === choiceId &&
                c.domain === domain &&
                c.selected.some((s) => normalizeKey(s) === normKey),
            )
          : ledger.choices.find(
              (c) =>
                c.domain === domain &&
                c.selected.some((s) => normalizeKey(s) === normKey),
            );
        if (!matchingChoice) return;

        const newSelected = matchingChoice.selected.filter(
          (s) => normalizeKey(s) !== normKey,
        );
        let newLedger = resolveChoice(ledger, matchingChoice.id, newSelected);

        // Remove the choice grant tag from the ledger proficiency map
        const map = newLedger.proficiencies[
          domain as keyof typeof newLedger.proficiencies
        ] as Record<string, import('@/lib/provenance/types').SourceTag[]>;
        if (map) {
          const tags = map[normKey] ?? [];
          const filtered = tags.filter(
            (t) =>
              !(
                t.grantType === 'choice' &&
                t.sourceName === matchingChoice.sourceTag.sourceName
              ),
          );
          const newMap =
            filtered.length > 0
              ? { ...map, [normKey]: filtered }
              : Object.fromEntries(
                  Object.entries(map).filter(([k]) => k !== normKey),
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
                (p) => normalizeKey(p) !== normKey,
              ),
            },
          });
        }
      }
    },
    [character, ledger, updateCharacter],
  );

  const proficiencyRows = useMemo(
    () => getAllProficiencyRows(ledger),
    [ledger],
  );
  const abilityBonusRows = useMemo(
    () => getAbilityBonusRows(ledger, character?.raceAsiChoices ?? undefined),
    [ledger, character?.raceAsiChoices],
  );
  const featRows = useMemo(() => getFeatRows(ledger), [ledger]);
  const featureRows = useMemo(() => getFeatureRows(ledger), [ledger]);
  const spellRows = useMemo(() => getSpellRows(ledger), [ledger]);
  const equipmentRows = useMemo(() => getEquipmentRows(ledger), [ledger]);

  const excludeSources = useCallback(
    (rows: SourceRow[], blocked: SourceType[]) =>
      rows.filter((row) => !row.sourceTypes.some((t) => blocked.includes(t))),
    [],
  );

  /** All rows for a specific section, with pending choices appended. */
  const getSourcesRowsBySection = useCallback(
    (sectionId: string): SourceRow[] => {
      switch (sectionId) {
        case 'build-proficiencies':
        case 'proficiencies':
          return excludeSources(
            [
              ...proficiencyRows.skills,
              ...proficiencyRows.savingThrows,
              ...proficiencyRows.armor,
              ...proficiencyRows.weapons,
              ...proficiencyRows.tools,
              ...proficiencyRows.languages,
              ...proficiencyRows.pendingChoices,
            ],
            ['manual'],
          );
        case 'build-race':
          return excludeSources(
            [
              ...abilityBonusRows,
              ...proficiencyRows.skills,
              ...proficiencyRows.languages,
              ...proficiencyRows.pendingChoices,
            ],
            ['race', 'subrace'],
          );
        case 'build-background':
          return excludeSources(
            [
              ...proficiencyRows.skills,
              ...proficiencyRows.languages,
              ...proficiencyRows.tools,
              ...proficiencyRows.pendingChoices,
            ],
            ['background'],
          );
        case 'build-class':
          return excludeSources(
            [
              ...proficiencyRows.skills,
              ...proficiencyRows.savingThrows,
              ...proficiencyRows.armor,
              ...proficiencyRows.weapons,
              ...proficiencyRows.tools,
              ...featureRows,
              ...spellRows,
              ...proficiencyRows.pendingChoices,
            ],
            ['class', 'subclass'],
          );
        case 'build-ability-scores':
        case 'ability-scores':
          return excludeSources(abilityBonusRows, ['manual']);
        case 'feats':
          return excludeSources(featRows, ['feat']);
        case 'features':
          return excludeSources(featureRows, ['optionalFeature']);
        case 'spells':
          return excludeSources(spellRows, ['manual']);
        case 'equipment':
          return excludeSources(equipmentRows, ['manual']);
        default:
          return [];
      }
    },
    [
      proficiencyRows,
      abilityBonusRows,
      featRows,
      featureRows,
      spellRows,
      equipmentRows,
      excludeSources,
    ],
  );

  const getCollapsedState = useCallback(
    (sectionId: string, defaultCollapsed = true) =>
      getCollapseState(sectionId, defaultCollapsed),
    [],
  );

  const persistCollapsedState = useCallback(
    (sectionId: string, collapsed: boolean) => {
      setCollapseState(sectionId, collapsed);
    },
    [],
  );

  return {
    ledger,
    // Actions
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
    // Derived rows
    proficiencyRows,
    abilityBonusRows,
    featRows,
    featureRows,
    spellRows,
    equipmentRows,
    getSourcesRowsBySection,
    // Collapse state
    getCollapsedState,
    persistCollapsedState,
  };
}
