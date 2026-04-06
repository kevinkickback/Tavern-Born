import {
  type AbilityName,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores';
import {
  getAbilityModifier,
  getProficiencyBonus,
} from '@/lib/calculations/gameRules';
import {
  type CasterProgression,
  calculateSpellSlots,
  getPactMagicSlots,
  getStandardSpellSlots,
  mergeSpellSlots,
  type SpellSlotsResult,
} from '@/lib/calculations/spellSlots';
import { getTotalLevel } from '@/lib/characterUtils';
import type { Class5e } from '@/types/5etools';
import type {
  AbilityScores,
  Character,
  CharacterClassEntry,
  SpellProfile,
  SpellSlots,
} from '@/types/character';

export const SPECIAL_SPELL_PROFILE_ID = 'special:unrestricted';
export const SPECIAL_SPELL_PROFILE_LABEL = 'Bonus Spells';

function toClassProfileId(name: string, source?: string): string {
  return `class:${name}|${source ?? ''}`;
}

function cloneProfile(profile: SpellProfile): SpellProfile {
  return {
    ...profile,
    cantrips: [...profile.cantrips],
    spellsKnown: [...profile.spellsKnown],
    preparedSpells: [...profile.preparedSpells],
  };
}

export function buildClassProfileLabel(entry: CharacterClassEntry): string {
  return entry.levels > 1
    ? `${entry.name} (Lv ${entry.levels})`
    : `${entry.name} (Lv 1)`;
}

export function buildClassSpellLevelKey(
  className: string | undefined,
  classSource: string | undefined,
  level: number,
): string {
  return `${className ?? ''}|${classSource ?? ''}:${level}`;
}

export function isSpellOnClassList(
  spell: {
    classes?: {
      fromClassList?: Array<{ name?: string; source?: string }>;
    };
  },
  className?: string,
  classSource?: string,
): boolean {
  if (!className) return true;

  const targetName = className.trim().toLowerCase();
  const targetSource = (classSource ?? '').trim().toLowerCase();
  const fromClassList = spell.classes?.fromClassList ?? [];

  if (fromClassList.length === 0) {
    return false;
  }

  return fromClassList.some((entry) => {
    const entryName = entry.name?.trim().toLowerCase();
    if (entryName !== targetName) return false;

    const entrySource = entry.source?.trim().toLowerCase();
    if (!targetSource || !entrySource) return true;

    return entrySource === targetSource;
  });
}

export function getProfileKnownNames(profile: SpellProfile): Set<string> {
  return new Set([...profile.cantrips, ...profile.spellsKnown]);
}

export function getKnownSpellNames(profiles: SpellProfile[]): Set<string> {
  const names = new Set<string>();

  for (const profile of profiles) {
    for (const name of profile.cantrips) {
      names.add(name);
    }
    for (const name of profile.spellsKnown) {
      names.add(name);
    }
  }

  return names;
}

export function ensureSpellProfiles(character: Character): SpellProfile[] {
  const existing = Array.isArray(character.spells.spellProfiles)
    ? character.spells.spellProfiles.map(cloneProfile)
    : [];

  const byId = new Map(existing.map((profile) => [profile.id, profile]));
  const next: SpellProfile[] = [];

  const classEntries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : character.class
        ? [
            {
              name: character.class,
              source: character.classSource,
              levels: character.level,
            },
          ]
        : [];

  for (const entry of classEntries) {
    const id = toClassProfileId(entry.name, entry.source);
    const existingProfile = byId.get(id);
    next.push({
      id,
      type: 'class',
      label: buildClassProfileLabel(entry),
      className: entry.name,
      classSource: entry.source,
      cantrips: existingProfile?.cantrips ?? [],
      spellsKnown: existingProfile?.spellsKnown ?? [],
      preparedSpells: existingProfile?.preparedSpells ?? [],
      alwaysPrepared: false,
    });
  }

  const special = byId.get(SPECIAL_SPELL_PROFILE_ID);
  next.push({
    id: SPECIAL_SPELL_PROFILE_ID,
    type: 'special',
    label: SPECIAL_SPELL_PROFILE_LABEL,
    cantrips: special?.cantrips ?? [],
    spellsKnown: special?.spellsKnown ?? [],
    preparedSpells: [],
    alwaysPrepared: true,
  });

  return next;
}

function storedToNumericUsed(spellSlots: SpellSlots): Record<number, number> {
  return {
    1: spellSlots.level1?.used ?? 0,
    2: spellSlots.level2?.used ?? 0,
    3: spellSlots.level3?.used ?? 0,
    4: spellSlots.level4?.used ?? 0,
    5: spellSlots.level5?.used ?? 0,
    6: spellSlots.level6?.used ?? 0,
    7: spellSlots.level7?.used ?? 0,
    8: spellSlots.level8?.used ?? 0,
    9: spellSlots.level9?.used ?? 0,
  };
}

export function numericToStored(
  calculated: SpellSlotsResult,
  usedMap: Record<number, number>,
): SpellSlots {
  const base: SpellSlots = {
    level1: { max: 0, used: 0 },
    level2: { max: 0, used: 0 },
    level3: { max: 0, used: 0 },
    level4: { max: 0, used: 0 },
    level5: { max: 0, used: 0 },
    level6: { max: 0, used: 0 },
    level7: { max: 0, used: 0 },
    level8: { max: 0, used: 0 },
    level9: { max: 0, used: 0 },
  };

  for (let sl = 1; sl <= 9; sl++) {
    const key = `level${sl}` as keyof SpellSlots;
    const calc = calculated[sl];
    if (calc) {
      base[key] = { max: calc.max, used: Math.min(usedMap[sl] ?? 0, calc.max) };
    }
  }

  return base;
}

function normalizeProgression(value?: string): CasterProgression {
  if (value === 'full') return 'full';
  if (value === '1/2') return '1/2';
  if (value === '1/3') return '1/3';
  if (value === 'pact') return 'pact';
  if (value === 'artificer') return 'artificer';
  return 'none';
}

function getCasterLevelContribution(
  progression: CasterProgression,
  classLevel: number,
): number {
  if (progression === 'full') return classLevel;
  if (progression === '1/2') return Math.floor(classLevel / 2);
  if (progression === '1/3') return Math.floor(classLevel / 3);
  if (progression === 'artificer') return Math.ceil(classLevel / 2);
  return 0;
}

export interface SpellcastingClassDetail {
  profileId: string;
  className: string;
  classSource?: string;
  classLevel: number;
  casterProgression: CasterProgression;
  spellcastingAbility?: AbilityName;
  spellSaveDC: number | null;
  spellAttackBonus: number | null;
  maxSpellLevel: number;
  knownSpellLimit: number | null;
  cantripLimit: number | null;
  isPreparedCaster: boolean;
}

function getProgressionArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
    ? (value as number[])
    : null;
}

export function isPreparedCaster(classData?: Class5e): boolean {
  if (!classData?.spellcastingAbility) return false;
  if (typeof classData.preparedSpells === 'string') return true;
  const known = getProgressionArray(classData.spellsKnownProgression);
  const knownFixed = getProgressionArray(classData.spellsKnownProgressionFixed);
  return !known && !knownFixed;
}

export function getCantripLimit(
  classData: Class5e | undefined,
  level: number,
): number | null {
  const progression = getProgressionArray(classData?.cantripProgression);
  if (!progression) return null;
  return progression[level - 1] ?? progression[progression.length - 1] ?? null;
}

export function getKnownSpellLimit(
  classData: Class5e | undefined,
  level: number,
): number | null {
  const fixed = getProgressionArray(classData?.spellsKnownProgressionFixed);
  if (fixed) return fixed[level - 1] ?? fixed[fixed.length - 1] ?? null;

  const known = getProgressionArray(classData?.spellsKnownProgression);
  if (known) return known[level - 1] ?? known[known.length - 1] ?? null;

  return null;
}

export function getClassMaxSpellLevel(
  classData: Class5e | undefined,
  classLevel: number,
): number {
  if (!classData) return 0;
  if (classData.casterProgression === 'pact') {
    const pactSlots = getPactMagicSlots(classLevel);
    return Object.keys(pactSlots)
      .map((k) => Number.parseInt(k, 10))
      .filter((k) => Number.isFinite(k))
      .reduce((max, k) => Math.max(max, k), 0);
  }

  const tableGroups = Array.isArray(classData.classTableGroups)
    ? (classData.classTableGroups as Array<{
        rowsSpellProgression?: unknown[];
      }>)
    : [];
  const spellRows = tableGroups.find((group) =>
    Array.isArray(group.rowsSpellProgression),
  )?.rowsSpellProgression;
  const row =
    classData.spellSlotProgression?.[classLevel - 1] ??
    spellRows?.[classLevel - 1];

  if (Array.isArray(row)) {
    return row
      .map((value, idx) => ({ value, level: idx + 1 }))
      .filter((item) => typeof item.value === 'number' && item.value > 0)
      .reduce((max, item) => Math.max(max, item.level), 0);
  }

  const fallback = calculateSpellSlots(
    classData.name,
    classLevel,
    classData.casterProgression,
  );
  return Object.keys(fallback)
    .map((k) => Number.parseInt(k, 10))
    .filter((k) => Number.isFinite(k))
    .reduce((max, k) => Math.max(max, k), 0);
}

export function buildSpellcastingClassDetails(
  character: Character,
  classesById: Map<string, Class5e>,
): SpellcastingClassDetail[] {
  const profiles = ensureSpellProfiles(character).filter(
    (profile) => profile.type === 'class',
  );
  const totalLevel = getTotalLevel({
    classes: character.classProgression?.map((entry) => ({
      name: entry.name,
      levels: entry.levels,
      source: entry.source,
    })) ?? [
      {
        name: character.class,
        levels: character.level,
        source: character.classSource,
      },
    ],
  });
  const proficiency = getProficiencyBonus(totalLevel);

  const entries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : [
          {
            name: character.class,
            source: character.classSource,
            levels: character.level,
          },
        ];

  return profiles
    .map((profile) => {
      const entry = entries.find(
        (candidate) =>
          candidate.name === profile.className &&
          (candidate.source ?? '') === (profile.classSource ?? ''),
      );
      if (!entry || !profile.className) return null;

      const classData = classesById.get(
        toClassProfileId(entry.name, entry.source),
      );
      const ability = classData?.spellcastingAbility
        ? normalizeAbilityName(classData.spellcastingAbility)
        : null;
      const mod = ability
        ? getAbilityModifier(
            (character.abilityScores as AbilityScores)[ability] ?? 10,
          )
        : null;
      const saveDc = mod !== null ? 8 + proficiency + mod : null;
      const attack = mod !== null ? proficiency + mod : null;

      return {
        profileId: profile.id,
        className: entry.name,
        classSource: entry.source,
        classLevel: entry.levels,
        casterProgression: normalizeProgression(classData?.casterProgression),
        spellcastingAbility: ability ?? undefined,
        spellSaveDC: saveDc,
        spellAttackBonus: attack,
        maxSpellLevel: getClassMaxSpellLevel(classData, entry.levels),
        knownSpellLimit: getKnownSpellLimit(classData, entry.levels),
        cantripLimit: getCantripLimit(classData, entry.levels),
        isPreparedCaster: isPreparedCaster(classData),
      } as SpellcastingClassDetail;
    })
    .filter((detail): detail is SpellcastingClassDetail => detail !== null)
    .filter((detail) => detail.casterProgression !== 'none');
}

function addSlotRows(
  acc: SpellSlotsResult,
  rows: SpellSlotsResult,
  pact = false,
): void {
  for (const [levelText, row] of Object.entries(rows)) {
    const level = Number.parseInt(levelText, 10);
    if (!row || !level) continue;
    const existing = acc[level];
    acc[level] = {
      max: (existing?.max ?? 0) + row.max,
      used: existing?.used ?? 0,
      ...(pact ? { isPactMagic: true } : {}),
    };
  }
}

export interface CharacterSpellSlotsBreakdown {
  shared: SpellSlotsResult;
  pact: SpellSlotsResult;
  mergedSharedWithUsage: SpellSlotsResult;
  mergedPactWithUsage: SpellSlotsResult;
}

export function calculateCharacterSpellSlots(
  character: Character,
  classesById: Map<string, Class5e>,
): CharacterSpellSlotsBreakdown {
  const entries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : character.class
        ? [
            {
              name: character.class,
              source: character.classSource,
              levels: character.level,
            },
          ]
        : [];

  let combinedCasterLevel = 0;
  const pact: SpellSlotsResult = {};

  for (const entry of entries) {
    const classData = classesById.get(
      toClassProfileId(entry.name, entry.source),
    );
    const progression = normalizeProgression(classData?.casterProgression);

    if (progression === 'pact') {
      addSlotRows(pact, getPactMagicSlots(entry.levels), true);
      continue;
    }

    combinedCasterLevel += getCasterLevelContribution(
      progression,
      entry.levels,
    );
  }

  const shared =
    combinedCasterLevel > 0 ? getStandardSpellSlots(combinedCasterLevel) : {};
  const usedMap = storedToNumericUsed(character.spells.spellSlots);

  const mergedSharedWithUsage = mergeSpellSlots(shared, usedMap);

  // Pact slots are tracked in the same usage pool, so allocate usage greedily by level.
  const pactUsedMap: Record<number, number> = {};
  for (const [levelText, slots] of Object.entries(pact)) {
    const level = Number.parseInt(levelText, 10);
    if (!level || !slots) continue;
    const used = Math.min(usedMap[level] ?? 0, slots.max);
    pactUsedMap[level] = used;
  }
  const mergedPactWithUsage = mergeSpellSlots(pact, pactUsedMap);

  return {
    shared,
    pact,
    mergedSharedWithUsage,
    mergedPactWithUsage,
  };
}

export function collectKnownSpells(profiles: SpellProfile[]): {
  cantrips: string[];
  spellsKnown: string[];
  preparedSpells: string[];
} {
  const cantrips = new Set<string>();
  const spellsKnown = new Set<string>();
  const prepared = new Set<string>();

  for (const profile of profiles) {
    for (const name of profile.cantrips) {
      cantrips.add(name);
      if (profile.alwaysPrepared) prepared.add(name);
    }
    for (const name of profile.spellsKnown) {
      spellsKnown.add(name);
      if (profile.alwaysPrepared || profile.preparedSpells.includes(name)) {
        prepared.add(name);
      }
    }
  }

  return {
    cantrips: [...cantrips],
    spellsKnown: [...spellsKnown],
    preparedSpells: [...prepared],
  };
}
