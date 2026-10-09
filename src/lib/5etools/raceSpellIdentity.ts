import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'

/** Collision-safe structural protocol. Consumers never normalize or interpret IDs as rules. */
export function encodeRaceSpellIdentity(
  kind: 'racial' | 'racial-suite' | 'racial-choice',
  parts: readonly unknown[],
): string {
  return `${kind}:${encodeURIComponent(JSON.stringify(parts))}`
}

export function decodeRaceSpellIdentity(
  identity: string,
  kind: 'racial' | 'racial-suite' | 'racial-choice',
): unknown[] | null {
  const prefix = `${kind}:`
  if (!identity.startsWith(prefix)) return null
  try {
    const parts: unknown = JSON.parse(decodeURIComponent(identity.slice(prefix.length)))
    return Array.isArray(parts) && encodeRaceSpellIdentity(kind, parts) === identity ? parts : null
  } catch {
    return null
  }
}

export function getRaceSpellChoiceKey(choice: {
  level: number
  count: number
  isCantrip: boolean
  filter?: { level: number; classes: string[] }
  pool?: string[]
}): string {
  return JSON.stringify([
    choice.level,
    choice.count,
    choice.isCantrip,
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
