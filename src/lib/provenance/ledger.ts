import { emptyProvenance } from '@/store/characterStore';
import { normalizeKey } from './normalization';
import type {
  AbilityBonusProvenanceRecord,
  ChoiceRecord,
  ChoiceStatus,
  ProficiencyProvenance,
  ProvenanceLedger,
  SourceTag,
} from './types';

type ProficiencyDomain = keyof ProficiencyProvenance;
type MapDomain =
  | ProficiencyDomain
  | 'features'
  | 'feats'
  | 'spells'
  | 'equipment';
type NonProficiencyMapDomain = Exclude<MapDomain, ProficiencyDomain>;

const PROFICIENCY_DOMAINS = new Set<string>([
  'armor',
  'weapons',
  'tools',
  'languages',
  'skills',
  'savingThrows',
]);

function isProficiencyDomain(domain: MapDomain): domain is ProficiencyDomain {
  return PROFICIENCY_DOMAINS.has(domain);
}

function getMap(
  ledger: ProvenanceLedger,
  domain: MapDomain,
): Record<string, SourceTag[]> {
  if (isProficiencyDomain(domain)) return ledger.proficiencies[domain];
  return getNonProficiencyMap(ledger, domain);
}

function getNonProficiencyMap(
  ledger: ProvenanceLedger,
  domain: NonProficiencyMapDomain,
): Record<string, SourceTag[]> {
  switch (domain) {
    case 'features':
      return ledger.features;
    case 'feats':
      return ledger.feats;
    case 'spells':
      return ledger.spells;
    case 'equipment':
      return ledger.equipment;
  }
}

function setMap(
  ledger: ProvenanceLedger,
  domain: MapDomain,
  map: Record<string, SourceTag[]>,
): ProvenanceLedger {
  if (isProficiencyDomain(domain)) {
    return {
      ...ledger,
      proficiencies: { ...ledger.proficiencies, [domain]: map },
    };
  }
  return setNonProficiencyMap(ledger, domain, map);
}

function setNonProficiencyMap(
  ledger: ProvenanceLedger,
  domain: NonProficiencyMapDomain,
  map: Record<string, SourceTag[]>,
): ProvenanceLedger {
  switch (domain) {
    case 'features':
      return { ...ledger, features: map };
    case 'feats':
      return { ...ledger, feats: map };
    case 'spells':
      return { ...ledger, spells: map };
    case 'equipment':
      return { ...ledger, equipment: map };
  }
}

function tagPresent(list: SourceTag[], tag: SourceTag): boolean {
  return list.some(
    (t) =>
      t.sourceType === tag.sourceType &&
      t.sourceName === tag.sourceName &&
      t.grantType === tag.grantType &&
      t.sourceRef === tag.sourceRef,
  );
}

/**
 * Add a single item grant to the ledger under a domain/key.
 * Idempotent — does nothing if an identical sourceType+sourceName+grantType already exists.
 */
export function addGrant(
  ledger: ProvenanceLedger,
  domain: MapDomain,
  key: string,
  tag: SourceTag,
): ProvenanceLedger {
  const normKey = normalizeKey(key);
  const map = getMap(ledger, domain);
  const existing = map[normKey] ?? [];
  if (tagPresent(existing, tag)) return ledger;
  return setMap(ledger, domain, { ...map, [normKey]: [...existing, tag] });
}

/**
 * Remove all grants attributed to a specific source (by sourceType + sourceName)
 * from a single domain. Keys that become empty are pruned.
 */
export function removeGrantsBySourceFromDomain(
  ledger: ProvenanceLedger,
  domain: MapDomain,
  sourceType: string,
  sourceName: string,
): ProvenanceLedger {
  const map = getMap(ledger, domain);
  const updated: Record<string, SourceTag[]> = {};
  for (const [k, tags] of Object.entries(map)) {
    const filtered = tags.filter(
      (t) => !(t.sourceType === sourceType && t.sourceName === sourceName),
    );
    if (filtered.length > 0) updated[k] = filtered;
  }
  return setMap(ledger, domain, updated);
}

const ALL_MAP_DOMAINS: MapDomain[] = [
  'armor',
  'weapons',
  'tools',
  'languages',
  'skills',
  'savingThrows',
  'features',
  'feats',
  'spells',
  'equipment',
];

/**
 * Remove ALL grants attributed to a specific source across every domain.
 * Also removes all ChoiceRecords and AbilityBonusProvenanceRecords for that source.
 */
export function removeGrantsBySource(
  ledger: ProvenanceLedger,
  sourceType: string,
  sourceName: string,
): ProvenanceLedger {
  let result = ledger;
  for (const domain of ALL_MAP_DOMAINS) {
    result = removeGrantsBySourceFromDomain(
      result,
      domain,
      sourceType,
      sourceName,
    );
  }
  // Remove ability bonus records
  result = {
    ...result,
    abilityBonuses: result.abilityBonuses.filter(
      (r) =>
        !(
          r.sourceTag.sourceType === sourceType &&
          r.sourceTag.sourceName === sourceName
        ),
    ),
    // Remove choices originating from this source
    choices: result.choices.filter(
      (c) =>
        !(
          c.sourceTag.sourceType === sourceType &&
          c.sourceTag.sourceName === sourceName
        ),
    ),
  };
  return result;
}

/** Replace all grants from a source with a new set (remove then re-apply). */
export function replaceSourceGrants(
  ledger: ProvenanceLedger,
  sourceType: string,
  sourceName: string,
  applyFn: (cleared: ProvenanceLedger) => ProvenanceLedger,
): ProvenanceLedger {
  const cleared = removeGrantsBySource(ledger, sourceType, sourceName);
  return applyFn(cleared);
}

/** Add an ability score bonus record. Idempotent by sourceType+sourceName+ability. */
export function addAbilityBonus(
  ledger: ProvenanceLedger,
  record: AbilityBonusProvenanceRecord,
): ProvenanceLedger {
  const exists = ledger.abilityBonuses.some(
    (r) =>
      r.sourceTag.sourceType === record.sourceTag.sourceType &&
      r.sourceTag.sourceName === record.sourceTag.sourceName &&
      r.ability === record.ability &&
      r.value === record.value,
  );
  if (exists) return ledger;
  return { ...ledger, abilityBonuses: [...ledger.abilityBonuses, record] };
}

/** Add a choice placeholder record. Idempotent by id. */
export function addChoicePlaceholder(
  ledger: ProvenanceLedger,
  choice: ChoiceRecord,
): ProvenanceLedger {
  if (ledger.choices.some((c) => c.id === choice.id)) return ledger;
  return { ...ledger, choices: [...ledger.choices, choice] };
}

/** Mark a choice as resolved with the given selected items. */
export function resolveChoice(
  ledger: ProvenanceLedger,
  choiceId: string,
  selected: string[],
): ProvenanceLedger {
  const choices = ledger.choices.map((c) => {
    if (c.id !== choiceId) return c;
    const status: ChoiceStatus =
      selected.length === 0
        ? 'pending'
        : selected.length < c.chooseCount
          ? 'partially-resolved'
          : 'resolved';
    return { ...c, selected, status };
  });
  return { ...ledger, choices };
}

/** Clear selected items from all choices attributed to a source (used on source deselect). */
export function clearChoiceSelectionsBySource(
  ledger: ProvenanceLedger,
  sourceType: string,
  sourceName: string,
): ProvenanceLedger {
  const choices = ledger.choices.map((c) => {
    if (
      c.sourceTag.sourceType !== sourceType ||
      c.sourceTag.sourceName !== sourceName
    )
      return c;
    return { ...c, selected: [], status: 'pending' as ChoiceStatus };
  });
  return { ...ledger, choices };
}

/** Return an empty fresh ledger. Re-exported convenience alias. */
export { emptyProvenance };
