import {
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import type { Spell5e } from '@/types/5etools'

/** Resolve catalog rules only for a complete spell printing; manual names stay independent. */
export function resolveSpellReference(
  reference: string,
  spellsByKey: Readonly<Record<string, Spell5e>>,
): Spell5e | undefined {
  if (!isSourceQualifiedSpellReference(reference)) return undefined
  const { name, source = '' } = parseSpellReference(reference)
  const normalizedName = name.toLowerCase()
  const normalizedSource = source.toLowerCase()
  const matches = (spell: Spell5e) =>
    spell.name.trim().toLowerCase() === normalizedName &&
    spell.source.trim().toLowerCase() === normalizedSource
  const direct = spellsByKey[reference]
  return direct && matches(direct) ? direct : Object.values(spellsByKey).find(matches)
}
