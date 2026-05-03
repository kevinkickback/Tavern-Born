/**
 * The nine D&D 5e alignments.
 *
 * FALLBACK: 5etools does not expose alignments as a structured list (only as
 * descriptive prose in variantrules.json). Remove and replace with a parsed
 * source when one becomes available.
 */
export const ALIGNMENTS: readonly string[] = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
] as const

/**
 * The seven D&D 5e lifestyle tiers (PHB "Lifestyle Expenses").
 *
 * FALLBACK: 5etools does not expose lifestyle names as a structured list.
 * Remove and replace with a parsed source when one becomes available.
 */
export const LIFESTYLES: readonly string[] = [
  'Wretched',
  'Squalid',
  'Poor',
  'Modest',
  'Comfortable',
  'Wealthy',
  'Aristocratic',
] as const

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
