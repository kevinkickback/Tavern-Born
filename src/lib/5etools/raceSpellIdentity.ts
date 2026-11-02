export { getAdditionalSpellChoiceKey as getRaceSpellChoiceKey } from './additionalSpellIdentity'

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
