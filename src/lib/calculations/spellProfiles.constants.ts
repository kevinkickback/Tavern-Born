import type { CharacterClassEntry } from '@/types/character'

export const SPECIAL_SPELL_PROFILE_ID = 'special:unrestricted'
export const SPECIAL_SPELL_PROFILE_LABEL = 'Bonus Spells'
export const RACIAL_SPELL_PROFILE_LABEL = 'Racial Spells'

export function toClassProfileId(name: string, source?: string): string {
  return `class:${name}|${source ?? ''}`
}

export function toRacialProfileId(raceName: string, raceSource?: string): string {
  return `racial:${raceName}|${raceSource ?? ''}`
}

export function buildClassProfileLabel(entry: CharacterClassEntry): string {
  return entry.levels > 1 ? `${entry.name} (Lv ${entry.levels})` : `${entry.name} (Lv 1)`
}

export function buildClassSpellLevelKey(
  className: string | undefined,
  classSource: string | undefined,
  level: number,
): string {
  return `${className ?? ''}|${classSource ?? ''}:${level}`
}
