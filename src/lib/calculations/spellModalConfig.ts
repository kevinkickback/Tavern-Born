import {
  getKnownSpellNames,
  getProfileKnownNames,
} from '@/lib/calculations/spellProfiles';
import type { Spell5e } from '@/types/5etools';
import type { SpellProfile } from '@/types/character';

export interface SpellModalConfigCategory {
  key: string;
  label: string;
  max: number;
  test: (spell: Spell5e) => boolean;
}

export interface SpellModalConfig {
  title: string;
  className?: string;
  classSource?: string;
  allowedLevels: Set<string>;
  initialFilters: {
    level: Set<string>;
    school: Set<string>;
    type: Set<string>;
  };
  categories: SpellModalConfigCategory[];
  initialSelectedNames: string[];
  lockedNames: Set<string>;
}

export interface SpellModalConfigDetail {
  cantripLimit: number | null;
  knownSpellLimit: number | null;
  isPreparedCaster: boolean;
  maxSpellLevel: number;
}

function getEntityKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`.toLowerCase();
}

export function buildSpellModalConfig(params: {
  activeProfile: SpellProfile | null;
  spellProfiles: SpellProfile[];
  detailsByProfileId: Map<string, SpellModalConfigDetail>;
  spellByName: Map<string, Spell5e>;
}): SpellModalConfig | null {
  const { activeProfile, spellProfiles, detailsByProfileId, spellByName } =
    params;

  if (!activeProfile) return null;

  const detail = detailsByProfileId.get(activeProfile.id);
  const ownedNames = getProfileKnownNames(activeProfile);
  const initialSelectedNames = [...ownedNames];
  const lockedNames = new Set(
    [...getKnownSpellNames(spellProfiles)].filter(
      (name) => !ownedNames.has(name),
    ),
  );

  const allowedLevels = new Set<string>();
  const categories: SpellModalConfigCategory[] = [];

  if (activeProfile.type === 'special') {
    allowedLevels.add('0');
    for (let level = 1; level <= 9; level++) {
      allowedLevels.add(String(level));
    }

    const initialFilters = {
      level: new Set(allowedLevels),
      school: new Set<string>(),
      type: new Set<string>(),
    };

    return {
      title: `Add Spells (${activeProfile.label})`,
      className: undefined,
      classSource: undefined,
      allowedLevels,
      initialFilters,
      categories: [
        {
          key: 'cantrips',
          label: 'cantrips',
          max: Number.POSITIVE_INFINITY,
          test: (spell: Spell5e) => spell.level === 0,
        },
        {
          key: 'spells',
          label: 'spells',
          max: Number.POSITIVE_INFINITY,
          test: (spell: Spell5e) => spell.level > 0,
        },
      ],
      initialSelectedNames,
      lockedNames,
    };
  }

  const selectedCantripCount = initialSelectedNames.filter(
    (spellName) => spellByName.get(getEntityKey(spellName))?.level === 0,
  ).length;
  const selectedSpellCount = initialSelectedNames.filter(
    (spellName) => spellByName.get(getEntityKey(spellName))?.level !== 0,
  ).length;

  const cantripLimit = detail?.cantripLimit ?? null;
  const knownSpellLimit = detail?.knownSpellLimit ?? null;
  const effectiveCantripLimit =
    cantripLimit === null
      ? selectedCantripCount > 0
        ? selectedCantripCount
        : null
      : Math.max(cantripLimit, selectedCantripCount);
  const effectiveSpellLimit = detail?.isPreparedCaster
    ? knownSpellLimit === null
      ? selectedSpellCount > 0
        ? selectedSpellCount
        : null
      : Math.max(knownSpellLimit, selectedSpellCount)
    : knownSpellLimit;

  if (effectiveCantripLimit !== null) {
    allowedLevels.add('0');
    categories.push({
      key: 'cantrips',
      label: 'cantrips',
      max: effectiveCantripLimit,
      test: (spell: Spell5e) => spell.level === 0,
    });
  }

  const maxSpellLevel = detail?.maxSpellLevel ?? 0;
  const canSelectLeveledSpells =
    effectiveSpellLimit === null || effectiveSpellLimit > 0;
  if (canSelectLeveledSpells) {
    for (let level = 1; level <= maxSpellLevel; level++) {
      allowedLevels.add(String(level));
    }
  }

  if (effectiveSpellLimit !== null && effectiveSpellLimit > 0) {
    categories.push({
      key: 'spells',
      label: 'spells',
      max: effectiveSpellLimit,
      test: (spell: Spell5e) => spell.level > 0,
    });
  } else if (canSelectLeveledSpells && maxSpellLevel > 0) {
    categories.push({
      key: 'spells',
      label: 'spells',
      max: Number.POSITIVE_INFINITY,
      test: (spell: Spell5e) => spell.level > 0,
    });
  }

  const initialFilters = {
    level: new Set(allowedLevels),
    school: new Set<string>(),
    type: new Set<string>(),
  };

  return {
    title: `Add Spells (${activeProfile.label})`,
    className: activeProfile.className,
    classSource: activeProfile.classSource,
    allowedLevels,
    initialFilters,
    categories,
    initialSelectedNames,
    lockedNames,
  };
}
