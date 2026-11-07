import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import { getFeatureSourceDigest } from './featureSourceAudit'

const parsedSpellFields = new Set([
  'classes',
  'classSpellRoutes',
  'classSpellRouteSource',
  'classSpellRouteDiagnostics',
])

/** Compare the original spell record independently of parser-added route evidence. */
function getIncludedSrdSpellDigest(spell: Spell5e) {
  if (spell.classSpellRouteSource?.input.targetOccurrences.length !== 1) return undefined
  const original = Object.fromEntries(
    Object.entries(spell).filter(([key]) => !parsedSpellFields.has(key)),
  )
  return getFeatureSourceDigest([original], false)
}

export function getIncludedSrdSpellReprints(
  spells: Readonly<Record<string, Spell5e>> | undefined,
  expectedRecords: ReadonlyMap<string, string>,
) {
  const proofs = new Map<string, number | undefined>()
  for (const spell of Object.values(spells ?? {})) {
    if (norm(spell.source) !== 'phb') continue
    const expected = expectedRecords.get(norm(spell.name))
    if (!expected) continue
    const key = getSpellReferenceKey(spell.name, 'XPHB')
    const valid = !proofs.has(key) && getIncludedSrdSpellDigest(spell) === expected
    proofs.set(key, valid ? spell.level : undefined)
  }
  return proofs
}
