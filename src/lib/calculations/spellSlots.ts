import type { Class5e } from '@/types/5etools';

export type CasterProgression =
  | 'full'
  | '1/2'
  | '1/3'
  | 'pact'
  | 'artificer'
  | 'none';

// Each row is [level-1 slots, level-2 slots, …, level-9 slots].
// Missing entries are 0 / not present.
const STANDARD_SPELL_SLOTS: number[][] = [
  /* lv 0  */ [],
  /* lv 1  */ [2],
  /* lv 2  */ [3],
  /* lv 3  */ [4, 2],
  /* lv 4  */ [4, 3],
  /* lv 5  */ [4, 3, 2],
  /* lv 6  */ [4, 3, 3],
  /* lv 7  */ [4, 3, 3, 1],
  /* lv 8  */ [4, 3, 3, 2],
  /* lv 9  */ [4, 3, 3, 3, 1],
  /* lv 10 */ [4, 3, 3, 3, 2],
  /* lv 11 */ [4, 3, 3, 3, 2, 1],
  /* lv 12 */ [4, 3, 3, 3, 2, 1],
  /* lv 13 */ [4, 3, 3, 3, 2, 1, 1],
  /* lv 14 */ [4, 3, 3, 3, 2, 1, 1],
  /* lv 15 */ [4, 3, 3, 3, 2, 1, 1, 1],
  /* lv 16 */ [4, 3, 3, 3, 2, 1, 1, 1],
  /* lv 17 */ [4, 3, 3, 3, 3, 1, 1, 1, 1],
  /* lv 18 */ [4, 3, 3, 3, 3, 2, 1, 1, 1],
  /* lv 19 */ [4, 3, 3, 3, 3, 2, 2, 1, 1],
  /* lv 20 */ [4, 3, 3, 3, 3, 2, 2, 2, 1],
];

const PACT_SLOT_COUNT = [
  0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4,
];
const PACT_SLOT_LEVEL = [
  0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
];

// Used only as a last-resort fallback when class data is not loaded.
// Prefer Class5e.casterProgression read from the actual data files.
export const CLASS_CASTER_PROGRESSION: Record<string, CasterProgression> = {
  Bard: 'full',
  Cleric: 'full',
  Druid: 'full',
  Sorcerer: 'full',
  Wizard: 'full',
  Artificer: 'artificer', // data says 'artificer' (ceiling half-caster), not '1/2'
  Paladin: '1/2',
  Ranger: '1/2',
  Warlock: 'pact',
  Barbarian: 'none',
  Fighter: 'none',
  Monk: 'none',
  Rogue: 'none',
};

export interface SpellSlotLevel {
  max: number;
  used: number;
  isPactMagic?: boolean;
}

export type SpellSlotsResult = Partial<Record<number, SpellSlotLevel>>;

/** Return the standard (non-pact) spell slot maximums for a given `casterLevel`. */
export function getStandardSpellSlots(casterLevel: number): SpellSlotsResult {
  if (casterLevel < 1 || casterLevel > 20) return {};
  const row = STANDARD_SPELL_SLOTS[casterLevel] ?? [];
  const result: SpellSlotsResult = {};
  for (let sl = 1; sl <= 9; sl++) {
    const count = row[sl - 1];
    if (count) result[sl] = { max: count, used: 0 };
  }
  return result;
}

/** Return pact magic slot maximums for a Warlock of the given `level`. */
export function getPactMagicSlots(level: number): SpellSlotsResult {
  if (level < 1 || level > 20) return {};
  const count = PACT_SLOT_COUNT[level];
  const slotLevel = PACT_SLOT_LEVEL[level];
  if (!count) return {};
  return { [slotLevel]: { max: count, used: 0, isPactMagic: true } };
}

/**
 * Read spell slot maximums directly from a class object's `classTableGroups` data.
 * This is the preferred approach — it handles all progression types correctly,
 * including 'artificer', without needing level-divisor logic.
 *
 * Returns `null` when the class has no `rowsSpellProgression` table
 * (e.g. Warlock, whose pact slot data is in a complex inline row format).
 * In that case, fall back to `calculateSpellSlots`.
 */
export function getSpellSlotsFromClassData(
  classData: Class5e,
  level: number,
): SpellSlotsResult | null {
  const tableGroup = classData.classTableGroups?.find(
    (g: { rowsSpellProgression?: unknown[] }) =>
      Array.isArray(g.rowsSpellProgression),
  );
  if (!tableGroup) return null;

  const row: number[] = tableGroup.rowsSpellProgression[level - 1] ?? [];
  const result: SpellSlotsResult = {};
  for (let sl = 1; sl <= row.length; sl++) {
    const count = row[sl - 1];
    if (count && count > 0) result[sl] = { max: count, used: 0 };
  }
  return result;
}

/**
 * Calculate the maximum spell slot array for a class at a given level.
 * Prefer `getSpellSlotsFromClassData` when the Class5e object is available.
 * This fallback uses the known-class lookup table when only a name is provided.
 *
 * @param className         - e.g. "Wizard"
 * @param level             - character class level (1–20)
 * @param casterProgression - from `Class5e.casterProgression`; overrides the table
 */
export function calculateSpellSlots(
  className: string,
  level: number,
  casterProgression?: string,
): SpellSlotsResult {
  const progression: CasterProgression =
    (casterProgression as CasterProgression) ??
    CLASS_CASTER_PROGRESSION[className] ??
    'none';

  if (progression === 'none') return {};
  if (progression === 'pact') return getPactMagicSlots(level);

  let casterLevel = level;
  if (progression === '1/2') casterLevel = Math.floor(level / 2);
  if (progression === '1/3') casterLevel = Math.floor(level / 3);
  if (progression === 'artificer') casterLevel = Math.ceil(level / 2);

  return getStandardSpellSlots(casterLevel);
}

/**
 * Is the given class name a spellcasting class (by the known progression table)?
 * Returns `false` for classes not in the table; use with game-data class objects
 * where `casterProgression` is available for better coverage.
 */
export function isSpellcaster(
  className: string,
  casterProgression?: string,
): boolean {
  const prog =
    (casterProgression as CasterProgression) ??
    CLASS_CASTER_PROGRESSION[className];
  return !!prog && prog !== 'none';
}

/**
 * Convert the stored `SpellSlots` format (named keys) to a number-keyed partial
 * record, preserving the `used` count while updating `max` from calculated slots.
 *
 * @param calculated   - slots calculated from class + level
 * @param storedUsed   - existing used counts keyed by spell level (1–9)
 */
export function mergeSpellSlots(
  calculated: SpellSlotsResult,
  storedUsed: Record<number, number>,
): SpellSlotsResult {
  const result: SpellSlotsResult = {};
  for (let sl = 1; sl <= 9; sl++) {
    const calc = calculated[sl];
    if (!calc) continue;
    const used = Math.min(storedUsed[sl] ?? 0, calc.max);
    result[sl] = { ...calc, used };
  }
  return result;
}
