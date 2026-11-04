import type { ItemPropertyReference } from '@/types/5etools'

export function getItemPropertyReferences(raw: unknown): ItemPropertyReference[] {
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    const reference = record.uid ?? record.property ?? record.abbreviation ?? record.name
    if (typeof reference !== 'string') return []
    return [typeof record.note === 'string' ? { uid: reference, note: record.note } : reference]
  })
}

export function getItemPropertyUid(property: ItemPropertyReference): string {
  return typeof property === 'string' ? property : property.uid
}

export function getItemPropertyLabel(
  property: ItemPropertyReference,
  propertyByAbbr: Readonly<Record<string, string>>,
): string {
  const uid = getItemPropertyUid(property)
  const abbreviation = uid.trim().split('|')[0]
  const name =
    propertyByAbbr[uid.trim().toUpperCase()] ??
    propertyByAbbr[abbreviation.toUpperCase()] ??
    abbreviation
  const note = typeof property === 'string' ? undefined : property.note
  return note ? `${name} (${note})` : name
}
