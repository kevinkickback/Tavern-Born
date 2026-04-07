import { addChoicePlaceholder, addGrant } from './ledger';
import { normalizeKey, stripItemTag } from './normalization';
import { makeSourceTag } from './sourceLabels';
import type { ChoiceRecord, ProvenanceLedger } from './types';

function normalizeGenericToolChoice(value: string): string | null {
  const key = normalizeKey(value);
  if (
    key.includes('musical instrument') ||
    key === 'anymusicalinstrument' ||
    key === 'instrumentmusical'
  ) {
    return 'musical instrument';
  }
  if (
    key.includes("artisan's tool") ||
    key.includes('artisans tool') ||
    key === 'anyartisanstool' ||
    key === 'anyartisantool'
  ) {
    return "artisan's tools";
  }
  if (
    key.includes('gaming set') ||
    key === 'anygamingset' ||
    key === 'setgaming'
  ) {
    return 'gaming set';
  }
  return null;
}

function isNarrativeChoiceTool(value: string): boolean {
  const key = normalizeKey(value);
  return (
    key.includes('of your choice') ||
    key.includes('choose') ||
    key.includes('one type of')
  );
}

/**
 * Apply proficiency grants from a class's startingProficiencies to the ledger.
 * Handles fixed armor/weapon/tool grants and skill choice placeholders.
 * Saving throw proficiency is tracked via the `proficiency` array on the class.
 */
export function applyClassGrants(
  cls: {
    name: string;
    source?: string;
    proficiency?: string[];
    startingProficiencies?: {
      armor?: string[];
      weapons?: string[];
      tools?: string[];
      toolProficiencies?: Array<
        Record<
          string,
          boolean | number | { choose?: { from?: string[]; count?: number } }
        >
      >;
      skills?: { choose?: { from: string[]; count: number } };
    };
  },
  subclass:
    | {
        name: string;
        source?: string;
      }
    | undefined,
  ledger: ProvenanceLedger,
): ProvenanceLedger {
  let result = ledger;
  const clsTag = makeSourceTag('class', cls.name, 'fixed', cls.source);
  const profs = cls.startingProficiencies ?? {};

  for (const name of profs.armor ?? []) {
    if (typeof name !== 'string') continue;
    result = addGrant(result, 'armor', stripItemTag(name), clsTag);
  }

  for (const name of profs.weapons ?? []) {
    if (typeof name !== 'string') continue;
    const cleanWeapon = stripItemTag(name);
    result = addGrant(result, 'weapons', cleanWeapon, clsTag);
  }

  // Fixed tool proficiencies.
  // When toolProficiencies[] is present it is the authoritative structured source
  // (mirrors fizbanes-forge: tools[] is display-only, toolProficiencies[] drives grants).
  // Fall back to tools[] only for classes that lack the structured field.
  const hasStructuredToolProfs = (profs.toolProficiencies?.length ?? 0) > 0;
  if (!hasStructuredToolProfs) {
    for (const name of profs.tools ?? []) {
      if (typeof name !== 'string') continue;
      const cleanName = stripItemTag(name);
      if (isNarrativeChoiceTool(cleanName)) continue;
      result = addGrant(result, 'tools', cleanName, clsTag);
    }
  }

  // Structured class tool proficiency choices (e.g. anyMusicalInstrument: 3)
  let toolChoiceIndex = 0;
  for (const block of profs.toolProficiencies ?? []) {
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose') continue;

      const generic = normalizeGenericToolChoice(key);
      if (generic && (val === true || (typeof val === 'number' && val > 0))) {
        const choiceRecord: ChoiceRecord = {
          id: `class:${normalizeKey(cls.name)}:tools:generic:${toolChoiceIndex}`,
          domain: 'tools',
          sourceTag: { ...clsTag, grantType: 'placeholder' },
          chooseCount: typeof val === 'number' && val > 0 ? val : 1,
          optionPool: [generic],
          selected: [],
          status: 'pending',
        };
        result = addChoicePlaceholder(result, choiceRecord);
        toolChoiceIndex++;
        continue;
      }

      if (val === true) {
        result = addGrant(result, 'tools', key, clsTag);
      }
    }

    const choose = (block as { choose?: { from?: string[]; count?: number } })
      .choose;
    if (choose) {
      const normalizedPool = (choose.from ?? []).map(
        (entry) => normalizeGenericToolChoice(entry) ?? entry,
      );
      const choiceRecord: ChoiceRecord = {
        id: `class:${normalizeKey(cls.name)}:tools:choose:${toolChoiceIndex}`,
        domain: 'tools',
        sourceTag: { ...clsTag, grantType: 'placeholder' },
        chooseCount: choose.count ?? 1,
        optionPool: normalizedPool,
        selected: [],
        status: 'pending',
      };
      result = addChoicePlaceholder(result, choiceRecord);
      toolChoiceIndex++;
    }
  }

  const skillChoice = profs.skills;
  if (skillChoice?.choose) {
    const choiceRecord: ChoiceRecord = {
      id: `class:${normalizeKey(cls.name)}:skills:choose`,
      domain: 'skills',
      sourceTag: { ...clsTag, grantType: 'placeholder' },
      chooseCount: skillChoice.choose.count ?? 2,
      optionPool: skillChoice.choose.from ?? [],
      selected: [],
      status: 'pending',
    };
    result = addChoicePlaceholder(result, choiceRecord);
  }

  // Saving throw proficiencies (from cls.proficiency: e.g. ['str', 'con'])
  for (const abbr of cls.proficiency ?? []) {
    result = addGrant(result, 'savingThrows', abbr.toLowerCase(), clsTag);
  }

  // Subclass attribution (just tag it; features/spells come via modal confirms)
  if (subclass) {
    // Subclass source is recorded separately; grant applicator per-modal confirm
    // will attribute spell/feature picks to the subclass source tag.
    void subclass;
  }

  return result;
}

/**
 * Record a spell granted by a class (either directly or via a level-up pick).
 * grantType 'fixed' for automatically-granted spells, 'choice' for user-picked.
 */
export function applyClassSpellGrant(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  spellName: string,
  grantType: 'fixed' | 'choice',
  options?: {
    spellGrantedAtLevel?: number;
    spellAttributionMode?: 'exact' | 'inferred-lowest-eligible';
  },
): ProvenanceLedger {
  const normSpell = normalizeKey(spellName);
  const existingTags = ledger.spells[normSpell] ?? [];
  const retained = existingTags.filter(
    (tag) =>
      !(
        tag.sourceType === 'class' &&
        tag.sourceName === className &&
        (tag.sourceRef ?? '') === (classSource ?? '')
      ),
  );

  const nextSpells =
    retained.length > 0
      ? { ...ledger.spells, [normSpell]: retained }
      : Object.fromEntries(
          Object.entries(ledger.spells).filter(([key]) => key !== normSpell),
        );

  const nextLedger = { ...ledger, spells: nextSpells };
  const tag = {
    ...makeSourceTag('class', className, grantType, classSource),
    ...(options?.spellGrantedAtLevel
      ? { spellGrantedAtLevel: options.spellGrantedAtLevel }
      : {}),
    ...(options?.spellAttributionMode
      ? { spellAttributionMode: options.spellAttributionMode }
      : {}),
  };

  return addGrant(nextLedger, 'spells', spellName, tag);
}

/**
 * Record a class-level spell choice placeholder (cantrips/spells gained at level N).
 */
export function addClassSpellChoicePlaceholder(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  level: number,
  type: 'cantrip' | 'spell',
  count: number,
  maxSpellLevel?: number,
): ProvenanceLedger {
  const tag = makeSourceTag('class', className, 'placeholder', classSource);
  const id = `class:${normalizeKey(className)}:${type}:level${level}`;
  const choiceRecord: ChoiceRecord = {
    id,
    domain: 'spells',
    sourceTag: tag,
    chooseCount: count,
    optionPool: maxSpellLevel ? [`level 0-${maxSpellLevel}`] : [],
    selected: [],
    status: 'pending',
  };
  return addChoicePlaceholder(ledger, choiceRecord);
}
