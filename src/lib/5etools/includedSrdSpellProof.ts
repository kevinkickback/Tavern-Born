import type { Spell5e } from '@/types/5etools'
import { getFeatureSourceDigest } from './featureSourceAudit'

const parsedSpellFields = new Set([
  'classes',
  'classSpellRoutes',
  'classSpellRouteSource',
  'classSpellRouteDiagnostics',
])

/** Compare the original spell record independently of parser-added route evidence. */
export function getIncludedSrdSpellDigest(spell: Spell5e) {
  if (spell.classSpellRouteSource?.input.targetOccurrences.length !== 1) return undefined
  const original = Object.fromEntries(
    Object.entries(spell).filter(([key]) => !parsedSpellFields.has(key)),
  )
  return getFeatureSourceDigest([original], false)
}
