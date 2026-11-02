import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'

export function getAdditionalSpellChoiceKey(choice: {
  level: number
  count: number
  isCantrip: boolean
  source?: 'known' | 'innate' | 'prepared'
  usage?: string
  dailyUses?: number | 'pb'
  filter?: { level: number; classes: string[] }
  pool?: string[]
}): string {
  return JSON.stringify([
    choice.level,
    choice.count,
    choice.isCantrip,
    choice.source ?? null,
    choice.usage ?? null,
    choice.dailyUses ?? null,
    choice.filter
      ? [
          choice.filter.level,
          [...new Set(choice.filter.classes.map((name) => name.trim().toLowerCase()))].sort(),
        ]
      : null,
    choice.pool
      ? [...new Set(choice.pool.map((reference) => getSpellReferenceKey(reference)))].sort()
      : null,
  ])
}
