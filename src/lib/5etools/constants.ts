/**
 * Canonical map of 5etools spell school abbreviations to full names.
 * Mirrors `Parser.SP_SCHOOL_ABV_TO_FULL` from upstream 5etools.
 */
export const SP_SCHOOL_ABV_TO_FULL: Readonly<Record<string, string>> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
  V: 'Evocation',
}
