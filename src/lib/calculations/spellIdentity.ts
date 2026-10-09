import { normalizeKey } from '@/lib/provenance/normalization'

export interface SpellReferenceParts {
  name: string
  source?: string
}

export function parseSpellReference(value: string): SpellReferenceParts {
  const tagged = value.trim().match(/^\{@spell\s+([^}|]+)(?:\|([^}|]+))?[^}]*\}$/i)
  const raw = tagged ? [tagged[1], tagged[2]] : value.trim().split('|')
  const name = raw[0]?.trim() ?? ''
  const source = raw[1]?.trim()
  return source ? { name, source } : { name }
}

export function formatSpellReference(value: string, source?: string): string {
  const parsed = parseSpellReference(value)
  const resolvedSource = source?.trim() || parsed.source
  return resolvedSource ? `${parsed.name}|${resolvedSource}` : parsed.name
}

export function getSpellNameKey(value: string): string {
  return normalizeKey(parseSpellReference(value).name)
}

export function getSpellReferenceKey(value: string, source?: string): string {
  const parsed = parseSpellReference(value)
  const sourceKey = (source ?? parsed.source)?.trim().toLowerCase() ?? ''
  return `${getSpellNameKey(parsed.name)}|${sourceKey}`
}

export function resolveSpellReferenceFromMap<T>(
  reference: string,
  spellsByReference: ReadonlyMap<string, T>,
): T | undefined {
  return spellsByReference.get(getSpellReferenceKey(reference))
}

export interface SpellSelectionMetadata {
  name: string
  spellLevel: number
  school?: string
}

export function resolveSpellSelectionMetadata<T extends { level: number; school?: string }>(
  references: readonly string[],
  spellsByReference: ReadonlyMap<string, T>,
): SpellSelectionMetadata[] {
  return references.map((name) => {
    const spell = resolveSpellReferenceFromMap(name, spellsByReference)
    return {
      name,
      spellLevel: spell?.level ?? 1,
      school: spell?.school,
    }
  })
}

export function buildSpellNameKeySet(values: Iterable<string>): Set<string> {
  return new Set(Array.from(values, getSpellNameKey).filter(Boolean))
}

export function dedupeSpellNames(values: Iterable<string>): string[] {
  const byKey = new Map<string, string>()
  for (const value of values) {
    const key = getSpellNameKey(value)
    if (key && !byKey.has(key)) byKey.set(key, value)
  }
  return [...byKey.values()]
}
