import type { Spell5e } from '@/types/5etools'

/** Resolves source-qualified spell references with a deterministic legacy name fallback. */
export function resolveSpellReference(
  reference: string,
  spellsByKey: Readonly<Record<string, Spell5e>>,
): Spell5e | undefined {
  const direct = spellsByKey[reference]
  if (direct) return direct
  const separator = reference.lastIndexOf('|')
  const name = (separator >= 0 ? reference.slice(0, separator) : reference).trim()
  const source = separator >= 0 ? reference.slice(separator + 1).trim() : ''
  return Object.values(spellsByKey)
    .filter((spell) => spell.name === name && (!source || spell.source === source))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.name.localeCompare(right.name),
    )[0]
}
