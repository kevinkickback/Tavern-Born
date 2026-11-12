import { parseSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'

export function getRevisedSpellReprintReferences(reprintedAs: unknown): string[] {
  return (Array.isArray(reprintedAs) ? reprintedAs : []).filter(
    (ref): ref is string =>
      typeof ref === 'string' && norm(parseSpellReference(ref).source) === 'xphb',
  )
}
