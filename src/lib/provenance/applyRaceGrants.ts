import { addAbilityBonus, addChoicePlaceholder, addGrant } from './ledger';
import { normalizeGenericToolChoice, normalizeKey } from './normalization';
import { makeSourceTag } from './sourceLabels';
import type { ChoiceRecord, ProvenanceLedger } from './types';

type ProfBlock = Record<
  string,
  boolean | { choose?: { from: string[]; count: number } } | number
>;

function applyProfBlocks(
  ledger: ProvenanceLedger,
  domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons',
  blocks: ProfBlock[],
  tag: import('./types').SourceTag,
  choiceIdPrefix: string,
): ProvenanceLedger {
  let result = ledger;
  let choiceIndex = 0;
  for (const block of blocks) {
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose' || key === 'anyStandard') continue;
      if (domain === 'tools') {
        const generic = normalizeGenericToolChoice(key);
        if (generic) {
          if (val === true || (typeof val === 'number' && val > 0)) {
            const choiceRecord: ChoiceRecord = {
              id: `${choiceIdPrefix}:${domain}:generic:${choiceIndex}`,
              domain,
              sourceTag: { ...tag, grantType: 'placeholder' },
              chooseCount: typeof val === 'number' && val > 0 ? val : 1,
              optionPool: [generic],
              selected: [],
              status: 'pending',
            };
            result = addChoicePlaceholder(result, choiceRecord);
            choiceIndex++;
            continue;
          }
        }
      }
      if (val === true) {
        result = addGrant(result, domain, key, tag);
      }
    }
    const anyStandard = (block as { anyStandard?: number }).anyStandard;
    if (anyStandard) {
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:any:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: anyStandard,
        optionPool: [],
        selected: [],
        status: 'pending',
      };
      result = addChoicePlaceholder(result, choiceRecord);
      choiceIndex++;
    }
    const choose = (block as { choose?: { from?: string[]; count?: number } })
      .choose;
    if (choose) {
      const normalizedPool =
        domain === 'tools'
          ? (choose.from ?? []).map(
              (entry) => normalizeGenericToolChoice(entry) ?? entry,
            )
          : (choose.from ?? []);
      const choiceRecord: ChoiceRecord = {
        id: `${choiceIdPrefix}:${domain}:choose:${choiceIndex}`,
        domain,
        sourceTag: { ...tag, grantType: 'placeholder' },
        chooseCount: choose.count ?? 1,
        optionPool: normalizedPool,
        selected: [],
        status: 'pending',
      };
      result = addChoicePlaceholder(result, choiceRecord);
      choiceIndex++;
    }
  }
  return result;
}

/**
 * Apply grants from a race (and optionally a subrace) to the provenance ledger.
 * Handles fixed proficiency grants, choice placeholders, and ability score bonuses.
 */
export function applyRaceGrants(
  race: {
    name: string;
    source?: string;
    skillProficiencies?: unknown[];
    languageProficiencies?: unknown[];
    ability?: unknown[];
  },
  subrace:
    | {
        name: string;
        source?: string;
        skillProficiencies?: unknown[];
        languageProficiencies?: unknown[];
        ability?: unknown[];
        overwrite?: { ability?: boolean };
      }
    | undefined,
  ledger: ProvenanceLedger,
): ProvenanceLedger {
  let result = ledger;

  const raceTag = makeSourceTag('race', race.name, 'fixed', race.source);

  result = applyProfBlocks(
    result,
    'skills',
    race.skillProficiencies ?? [],
    raceTag,
    `race:${normalizeKey(race.name)}`,
  );

  result = applyProfBlocks(
    result,
    'languages',
    race.languageProficiencies ?? [],
    raceTag,
    `race:${normalizeKey(race.name)}`,
  );

  for (const block of race.ability ?? []) {
    let choiceIndex = 0;
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose') {
        const choose = val as {
          from?: string[];
          count?: number;
          amount?: number;
        };
        const choiceRecord: ChoiceRecord = {
          id: `race:${normalizeKey(race.name)}:abilityBonuses:choose:${choiceIndex}`,
          domain: 'abilityBonuses',
          sourceTag: { ...raceTag, grantType: 'placeholder' },
          chooseCount: choose.count ?? 1,
          amount: choose.amount ?? 1,
          optionPool: choose.from ?? [],
          selected: [],
          status: 'pending',
        };
        result = addChoicePlaceholder(result, choiceRecord);
        choiceIndex++;
      } else if (typeof val === 'number') {
        result = addAbilityBonus(result, {
          ability: key.toLowerCase(),
          value: val,
          sourceTag: raceTag,
        });
      }
    }
  }

  if (subrace) {
    const subraceTag = makeSourceTag(
      'subrace',
      subrace.name,
      'fixed',
      subrace.source,
    );
    const replace = subrace.overwrite?.ability === true;

    if (replace) {
      // Remove parent race ability bonuses and apply subrace's
      result = {
        ...result,
        abilityBonuses: result.abilityBonuses.filter(
          (r) =>
            r.sourceTag.sourceType !== 'race' ||
            r.sourceTag.sourceName !== race.name,
        ),
        choices: result.choices.filter(
          (c) =>
            !(
              c.domain === 'abilityBonuses' &&
              c.sourceTag.sourceType === 'race' &&
              c.sourceTag.sourceName === race.name
            ),
        ),
      };
    }

    for (const block of subrace.ability ?? []) {
      let choiceIndex = 0;
      for (const [key, val] of Object.entries(block)) {
        if (key === 'choose') {
          const choose = val as {
            from?: string[];
            count?: number;
            amount?: number;
          };
          const choiceRecord: ChoiceRecord = {
            id: `subrace:${normalizeKey(subrace.name)}:abilityBonuses:choose:${choiceIndex}`,
            domain: 'abilityBonuses',
            sourceTag: { ...subraceTag, grantType: 'placeholder' },
            chooseCount: choose.count ?? 1,
            amount: choose.amount ?? 1,
            optionPool: choose.from ?? [],
            selected: [],
            status: 'pending',
          };
          result = addChoicePlaceholder(result, choiceRecord);
          choiceIndex++;
        } else if (typeof val === 'number') {
          result = addAbilityBonus(result, {
            ability: key.toLowerCase(),
            value: val,
            sourceTag: subraceTag,
          });
        }
      }
    }

    result = applyProfBlocks(
      result,
      'skills',
      subrace.skillProficiencies ?? [],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
    );
    result = applyProfBlocks(
      result,
      'languages',
      subrace.languageProficiencies ?? [],
      subraceTag,
      `subrace:${normalizeKey(subrace.name)}`,
    );
  }

  return result;
}
