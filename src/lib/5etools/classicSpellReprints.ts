import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'

type SpellCatalog = Readonly<Record<string, Spell5e>>
type Reprint = { classic: Spell5e; revised: string }

/** Preserve both ends of the explicit reprint, including renamed spells. */
export function getClassicSpellReprints(raw: SpellCatalog | undefined) {
  const byClassic = new Map<string, Reprint>()
  const byRevised = new Map<string, Reprint>()
  if (!raw) return { byClassic, byRevised }
  const claims = new Map<string, Array<Reprint & { unambiguous: boolean }>>()
  const occurrences = new Map<string, number>()
  for (const spell of Object.values(raw)) {
    if (norm(spell.source) !== 'phb') continue
    const key = getSpellReferenceKey(spell.name, spell.source)
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1)
    const targets = (Array.isArray(spell.reprintedAs) ? spell.reprintedAs : []).filter(
      (ref): ref is string =>
        typeof ref === 'string' && norm(parseSpellReference(ref).source) === 'xphb',
    )
    for (const revised of targets) {
      if (!isSourceQualifiedSpellReference(revised)) continue
      const target = getSpellReferenceKey(revised)
      const prior = claims.get(target) ?? []
      prior.push({ classic: spell, revised, unambiguous: targets.length === 1 })
      claims.set(target, prior)
    }
  }
  for (const [target, rows] of claims) {
    if (rows.length !== 1) continue
    const [reprint] = rows
    const key = getSpellReferenceKey(reprint.classic.name, reprint.classic.source)
    if (
      occurrences.get(key) === 1 &&
      reprint.classic.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
      reprint.unambiguous
    ) {
      byClassic.set(key, reprint)
      byRevised.set(target, reprint)
    }
  }
  return { byClassic, byRevised }
}

export type ClassicSpellReprints = ReturnType<typeof getClassicSpellReprints>
