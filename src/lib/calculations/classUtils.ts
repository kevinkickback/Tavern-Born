import { toAbilityName } from '@/lib/calculations/abilityNames'
import { casterProgressionToFull } from '@/lib/calculations/spellSlots'
import { renderEntry } from '@/lib/renderer'
import type { Class5e } from '@/types/5etools'

export function getSavingThrowsDisplay(classData: Class5e): string {
  const values = classData.proficiency ?? []
  if (values.length === 0) return 'None'
  return values
    .map((value) => toAbilityName(value) ?? value)
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
    .join(', ')
}

export function getSpellcastingStatDisplay(classData: Class5e): string {
  if (!classData.spellcastingAbility) return 'None'
  const normalized = toAbilityName(classData.spellcastingAbility)
  const stat = (normalized ?? classData.spellcastingAbility).replace(/^./, (char) =>
    char.toUpperCase(),
  )
  const progression = classData.casterProgression
    ? ` (${casterProgressionToFull(classData.casterProgression)})`
    : ''
  return `${stat}${progression}`
}

export function formatProficiencyList(
  values: readonly unknown[] | undefined,
  kind?: 'armor' | 'weapon',
): string | null {
  return (
    values
      ?.flatMap((value) => {
        if (value && typeof value === 'object' && 'full' in value && typeof value.full === 'string')
          return [renderEntry(value.full)]
        if (typeof value !== 'string') return []
        const category = value.trim().toLowerCase()
        const key =
          kind === 'armor'
            ? /^(light|medium|heavy)( armor)?$|^(shield)s?$/.exec(category)
            : kind === 'weapon'
              ? /^(simple|martial)( weapons?)?$/.exec(category)
              : null
        return [
          renderEntry(key ? `{@proficiency ${key[1] ?? key[3]}|${kind}|${value.trim()}}` : value),
        ]
      })
      .filter(Boolean)
      .join(', ') || null
  )
}
