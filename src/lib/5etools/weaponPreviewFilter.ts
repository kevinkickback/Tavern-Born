import type { Item5e, ItemProperty5e } from '@/types/5etools'
import { getItemPropertyReferences, getItemPropertyUid } from './itemProperties'

function propertyUid(abbreviation: string, source: string): string {
  return `${abbreviation.trim()}|${source.trim()}`.toUpperCase()
}

export function buildWeaponPreviewPropertyLookup(properties: readonly ItemProperty5e[]) {
  const labels = new Map<string, string | undefined>()
  for (const property of properties) {
    if (typeof property?.abbreviation !== 'string' || typeof property.source !== 'string') continue
    const uid = propertyUid(property.abbreviation, property.source)
    if (labels.has(uid) || property.sourceIdentityConflict) {
      labels.set(uid, undefined)
      continue
    }
    const direct = typeof property.name === 'string' ? property.name.trim() : ''
    const entry = Array.isArray(property.entries) ? property.entries[0] : undefined
    labels.set(uid, direct || (typeof entry?.name === 'string' ? entry.name.trim() : undefined))
  }
  return Object.fromEntries(labels)
}

/** Positive weapon type and property clauses from 5etools item filters. */
export function getWeaponPreviewFilterKey(clauses: string): string | undefined {
  const keys = clauses
    .toLowerCase()
    .split('|')
    .map((clause) => clause.trim())
    .sort()
  if (keys.length !== 2) return undefined
  const category = /^type\s*=\s*(simple|martial) weapon$/.exec(keys[1])?.[1]
  const property = /^property\s*=\s*(.+)$/.exec(keys[0])?.[1]
  if (!category || !property) return undefined
  const names = property.split(';').map((name) => name.trim())
  if (!names.every((name) => /^[a-z]+(?:[ -][a-z]+)*$/.test(name))) return undefined
  return [category, ...new Set(names.sort())].join(';')
}

export function matchesWeaponPreviewProperties(
  item: Item5e,
  names: readonly string[],
  labels: Readonly<Record<string, string | undefined>>,
): boolean {
  if (!names.length) return true
  return getItemPropertyReferences(item.property).some((reference) => {
    const [abbreviation, source, ...extra] = getItemPropertyUid(reference).split('|')
    if (extra.length) return false
    // Bare upstream property UIDs default to PHB. Qualified UIDs stay exact.
    const label = labels[propertyUid(abbreviation, source?.trim() || 'PHB')]?.toLowerCase()
    return label !== undefined && names.includes(label)
  })
}
