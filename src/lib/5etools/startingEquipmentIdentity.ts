import type { StartingItemReference } from '@/types/character'

export const startingItemKey = (reference: StartingItemReference): string =>
  JSON.stringify([reference.name.trim().toLowerCase(), reference.source.trim().toLowerCase()])

export function startingItemUid(uid: string): StartingItemReference | undefined {
  const parts = uid.split('|')
  if (parts.length > 2 || !parts[0]?.trim()) return undefined
  return { name: parts[0].trim(), source: parts[1]?.trim() || 'PHB' }
}
