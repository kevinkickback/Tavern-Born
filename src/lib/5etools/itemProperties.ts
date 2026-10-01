import type { ItemPropertyReference } from '@/types/5etools'

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
