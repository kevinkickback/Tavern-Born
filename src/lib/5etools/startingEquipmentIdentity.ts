import type { StartingItemReference } from '@/types/character'

export const startingItemKey = (reference: StartingItemReference): string =>
  JSON.stringify([reference.name.trim().toLowerCase(), reference.source.trim().toLowerCase()])

export function startingItemUid(
  uid: string,
  defaultSource = 'PHB',
): StartingItemReference | undefined {
  const parts = uid.split('|')
  if (parts.length > 2 || !parts[0]?.trim()) return undefined
  return { name: parts[0].trim(), source: parts[1]?.trim() || defaultSource }
}

export function itemGroupMemberReference(
  value: unknown,
  defaultSource: string,
): StartingItemReference | undefined {
  if (typeof value === 'string') return startingItemUid(value, defaultSource)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { name, source } = value as Record<string, unknown>
  if (typeof name !== 'string' || typeof source !== 'string' || !source.trim()) return undefined
  return startingItemUid(`${name}|${source}`)
}
