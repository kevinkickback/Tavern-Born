import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { SpellProfile } from '@/types/character'
import { getSpellNameKey, getSpellReferenceKey } from './spellIdentity'

export function isSpecialSpellGrant(tag: SpellSourceTag): boolean {
  return !['race', 'subrace', 'class', 'subclass'].includes(tag.sourceType)
}

/** A fixed grant protects its exact target, not every printing with the same name. */
export function isFixedProfileSpell(
  profile: SpellProfile,
  ledger: ProvenanceLedger,
  reference: string,
): boolean {
  const key = getSpellReferenceKey(reference)
  return (
    profile.fixedSpells?.some((fixed) => getSpellReferenceKey(fixed) === key) === true ||
    (profile.type === 'special' &&
      (ledger.spells[getSpellNameKey(reference)] ?? []).some(
        (tag) =>
          tag.sourceType === 'feat' &&
          getSpellReferenceKey(reference, tag.grantSource ?? '') === key,
      ))
  )
}
