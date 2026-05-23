/**
 * Map of 5etools ability-score abbreviations to lowercase full names.
 *
 * FALLBACK: 5etools has no standalone ability-score list JSON file; these
 * abbreviations are embedded in skill/class/item entries. Validated in DEV
 * mode against data/skills.json via validateSkillToAbilityMap() in skills.ts.
 * Remove and replace with a parsed source if one becomes available.
 */
export const ABILITY_ABBREV_TO_FULL: Readonly<Record<string, string>> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}

export const ABILITY_ABBREV_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

export const ABILITY_ABBREV_TO_TITLE: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

export function toAbilityAbbrev(key: string): string | null {
  const lower = key.toLowerCase()
  if (ABILITY_ABBREV_TO_TITLE[lower]) return lower
  const fromFull = Object.entries(ABILITY_ABBREV_TO_FULL).find(([, full]) => full === lower)
  return fromFull?.[0] ?? null
}
