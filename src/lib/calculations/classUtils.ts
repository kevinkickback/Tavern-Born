import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { casterProgressionToFull } from '@/lib/calculations/spellSlots'
import { renderEntry } from '@/lib/renderer'
import type { Class5e } from '@/types/5etools'

export function getSavingThrowsDisplay(classData: Class5e): string {
  const values = classData.proficiency ?? []
  if (values.length === 0) return 'None'
  return values
    .map((value) => normalizeAbilityName(value) ?? value)
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1))
    .join(', ')
}

export function getSpellcastingStatDisplay(classData: Class5e): string {
  if (!classData.spellcastingAbility) return 'None'
  const normalized = normalizeAbilityName(classData.spellcastingAbility)
  const stat = (normalized ?? classData.spellcastingAbility).replace(/^./, (char) =>
    char.toUpperCase(),
  )
  const progression = classData.casterProgression
    ? ` (${casterProgressionToFull(classData.casterProgression)})`
    : ''
  return `${stat}${progression}`
}

export function formatProficiencyList(values?: string[]): string | null {
  if (!values || values.length === 0) return null
  return values.map((value) => renderEntry(value).replace(/^<p>|<\/p>$/g, '')).join(', ')
}
