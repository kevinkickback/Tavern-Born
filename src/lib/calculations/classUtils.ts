import { getWeaponPreviewFilterKey } from '@/lib/5etools/weaponPreviewFilter'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import { casterProgressionToFull } from '@/lib/calculations/spellSlots'
import { capitalizeLabel } from '@/lib/displayLabels'
import { renderEntry } from '@/lib/renderer'
import type { Class5e } from '@/types/5etools'

export function getSavingThrowsDisplay(classData: Class5e): string {
  const values = classData.proficiency ?? []
  if (values.length === 0) return 'None'
  return values
    .map((value) => toAbilityName(value) ?? value)
    .map(capitalizeLabel)
    .join(', ')
}

export function getSpellcastingStatDisplay(classData: Class5e): string {
  if (!classData.spellcastingAbility) return 'None'
  const normalized = toAbilityName(classData.spellcastingAbility)
  const stat = capitalizeLabel(normalized ?? classData.spellcastingAbility)
  const progression = classData.casterProgression
    ? ` (${casterProgressionToFull(classData.casterProgression)})`
    : ''
  return `${stat}${progression}`
}

function capitalizeItemProficiency(text: string): string {
  // Standalone item labels have a display field separate from their lookup name and source.
  return text.replace(
    /^\s*\{@item ([^|{}]+)(?:\|([^|{}]*))?(?:\|([^{}]*))?}\s*$/,
    (_, name: string, source = '', label?: string) =>
      `{@item ${name}|${source}|${capitalizeLabel(label?.trim() ? label : name)}}`,
  )
}

export function formatProficiencyList(
  values: readonly unknown[] | undefined,
  kind?: 'armor' | 'weapon',
): string | null {
  const labels = values
    ?.flatMap((value) => {
      if (value && typeof value === 'object' && 'full' in value && typeof value.full === 'string')
        return [value.full]
      if (typeof value !== 'string') return []
      const category = value.trim().toLowerCase()
      const key =
        kind === 'armor'
          ? /^(light|medium|heavy)( armor)?$|^(shield)s?$/.exec(category)
          : kind === 'weapon'
            ? /^(simple|martial)( weapons?)?$/.exec(category)
            : null
      const itemLabel = capitalizeItemProficiency(value)
      return [
        key
          ? `{@proficiency ${key[1] ?? key[3]}|${kind}|${capitalizeLabel(value.trim())}}`
          : kind === 'weapon'
            ? itemLabel.replace(
                /\{@filter ([^|{}]+)\|items\|([^{}]+)}/gi,
                (tag, label: string, clauses: string) => {
                  const filter = getWeaponPreviewFilterKey(clauses)
                  return filter ? `{@proficiency ${filter}|weapon|${label}}` : tag
                },
              )
            : itemLabel,
      ]
    })
    .filter(Boolean)
    .join(', ')

  return labels ? renderEntry(labels) : null
}
