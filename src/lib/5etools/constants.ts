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
 *
 * FALLBACK: 5etools does not expose this as a standalone JSON data file;
 * the abbreviations are defined only in the 5etools JS source. Remove and
 * replace with a parsed source if one becomes available.
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

/**
 * Map of 5etools damage-type abbreviations to human-readable names.
 *
 * FALLBACK: 5etools has no standalone damage-type list JSON file; these
 * abbreviations are embedded in item/spell entries. Remove and replace with
 * a parsed source if one becomes available.
 */
export const DAMAGE_TYPE_LABELS: Readonly<Record<string, string>> = {
  S: 'Slashing',
  P: 'Piercing',
  B: 'Bludgeoning',
  N: 'Necrotic',
  F: 'Fire',
  C: 'Cold',
  L: 'Lightning',
  T: 'Thunder',
  A: 'Acid',
  Po: 'Poison',
  Ps: 'Psychic',
  R: 'Radiant',
  O: 'Force',
}

/**
 * Validate that SP_SCHOOL_ABV_TO_FULL covers every spell school abbreviation
 * present in the loaded spell data. Call once after spells load in DEV mode.
 */
export function validateSpellSchoolCoverage(spells: unknown[]): void {
  const seen = new Set<string>()
  for (const spell of spells) {
    if (!spell || typeof spell !== 'object') continue
    const school = (spell as Record<string, unknown>).school
    if (typeof school === 'string' && school.trim()) seen.add(school.trim().toUpperCase())
  }
  for (const abbr of seen) {
    if (!SP_SCHOOL_ABV_TO_FULL[abbr]) {
      console.warn(
        `[constants] validateSpellSchoolCoverage: spell school "${abbr}" found in data but missing from SP_SCHOOL_ABV_TO_FULL. Add it to src/lib/5etools/constants.ts.`,
      )
    }
  }
}

/**
 * Validate that DAMAGE_TYPE_LABELS covers every damage-type abbreviation
 * present in the loaded item data. Call once after items load in DEV mode.
 */
export function validateDamageTypeCoverage(items: unknown[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const dmgType = (item as Record<string, unknown>).dmgType
    if (typeof dmgType === 'string' && dmgType.trim()) seen.add(dmgType.trim())
  }
  for (const code of seen) {
    if (!DAMAGE_TYPE_LABELS[code]) {
      console.warn(
        `[constants] validateDamageTypeCoverage: damage type "${code}" found in data but missing from DAMAGE_TYPE_LABELS. Add it to src/lib/5etools/constants.ts.`,
      )
    }
  }
}

/**
 * Known magic item rarity tiers in priority order (lowest → highest).
 *
 * FALLBACK: 5etools does not expose rarity tiers as a structured list; these
 * strings are per-item values in data/items.json → .item[].rarity.
 * 'unknown' is a catch-all for items whose rarity field is absent or unrecognised.
 * Remove and replace with a parsed source if 5etools ever exposes a rarity enum.
 */
export const RARITY_ORDER = [
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
  'unknown',
] as const

export type ItemRarity = (typeof RARITY_ORDER)[number]

/**
 * Tailwind CSS badge classes per rarity tier.
 * Keys mirror RARITY_ORDER (all lowercase). Update alongside RARITY_ORDER
 * when new tiers appear.
 */
export const RARITY_COLORS: Record<string, string> = {
  common: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300',
  uncommon: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400',
  rare: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400',
  'very rare':
    'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400',
  legendary:
    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400',
  artifact: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400',
  unknown: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400',
}

/**
 * Validate that RARITY_COLORS covers every rarity string present in the loaded
 * item data. Call once after items load in DEV mode.
 */
export function validateRarityCoverage(items: unknown[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const rarity = (item as Record<string, unknown>).rarity
    if (typeof rarity === 'string' && rarity && rarity !== 'none') seen.add(rarity.toLowerCase())
  }
  for (const rarity of seen) {
    if (!(rarity in RARITY_COLORS)) {
      console.warn(
        `[constants] validateRarityCoverage: rarity "${rarity}" found in item data but not in ` +
          'RARITY_COLORS (src/lib/5etools/constants.ts). Add it to maintain badge styling.',
      )
    }
  }
}
