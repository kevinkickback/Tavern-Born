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
