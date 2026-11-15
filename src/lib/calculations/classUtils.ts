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

function capitalizeProficiencyEntry(text: string): string {
  // A leading item reference has a display field separate from its lookup name and source.
  return capitalizeLabel(text).replace(
    /^\{@item ([^|}]+)(?:\|([^|}]*))?(?:\|([^}]*))?}/,
    (_, name: string, source = '', label?: string) =>
      `{@item ${name}|${source}|${capitalizeLabel(label?.trim() || name)}}`,
  )
}

export function formatProficiencyList(
  values: readonly unknown[] | undefined,
  kind?: 'armor' | 'weapon',
): string | null {
  return (
    values
      ?.flatMap((value) => {
        if (value && typeof value === 'object' && 'full' in value && typeof value.full === 'string')
          return [renderEntry(capitalizeProficiencyEntry(value.full.trim()))]
        if (typeof value !== 'string') return []
        const label = capitalizeProficiencyEntry(value.trim())
        const category = value.trim().toLowerCase()
        const key =
          kind === 'armor'
            ? /^(light|medium|heavy)( armor)?$|^(shield)s?$/.exec(category)
            : kind === 'weapon'
              ? /^(simple|martial)( weapons?)?$/.exec(category)
              : null
        return [
          renderEntry(
            key
              ? `{@proficiency ${key[1] ?? key[3]}|${kind}|${label}}`
              : kind === 'weapon'
                ? label.replace(
                    /\{@filter ([^|{}]+)\|items\|([^{}]+)}/gi,
                    (tag, label: string, clauses: string) => {
                      const filter = getWeaponPreviewFilterKey(clauses)
                      return filter ? `{@proficiency ${filter}|weapon|${label}}` : tag
                    },
                  )
                : label,
          ),
        ]
      })
      .filter(Boolean)
      .join(', ') || null
  )
}
