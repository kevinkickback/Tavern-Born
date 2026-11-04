import type { CharacterClassEntry } from '@/types/character'

export const SPECIAL_SPELL_PROFILE_ID = 'special:unrestricted'
export const SPECIAL_SPELL_PROFILE_LABEL = 'Bonus Spells'

export function toClassProfileId(name: string, source?: string): string {
  return `class:${name}|${source ?? ''}`
}

export function getClassSpellProfileMetadata(entry: CharacterClassEntry) {
  return {
    id: toClassProfileId(entry.name, entry.source),
    type: 'class' as const,
    label: entry.levels > 1 ? `${entry.name} (Lv ${entry.levels})` : `${entry.name} (Lv 1)`,
    className: entry.name,
    classSource: entry.source,
    alwaysPrepared: false,
  }
}

export function buildClassSpellLevelKey(
  className: string | undefined,
  classSource: string | undefined,
  level: number,
): string {
  return `${className ?? ''}|${classSource ?? ''}:${level}`
}
