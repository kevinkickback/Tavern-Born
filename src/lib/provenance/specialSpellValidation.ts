import {
  getSpellNameKey,
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
} from '@/lib/calculations/spellIdentity'
import { isSpecialSpellGrant } from '@/lib/calculations/spellOwnership'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import type { Character } from '@/types/character'

/** Catalog-independent kind and fixed-target consistency; manual unknown sources stay unresolved. */
export function getInvalidSpecialSpellPaths(character: Character): Array<Array<string | number>> {
  const invalid: Array<Array<string | number>> = []
  const profiles = character.spells.spellProfiles
  const index = profiles.findIndex((profile) => profile.id === SPECIAL_SPELL_PROFILE_ID)
  if (profiles.filter((profile) => profile.id === SPECIAL_SPELL_PROFILE_ID).length !== 1)
    return [['spells', 'spellProfiles']]
  const profile = profiles[index]
  const path = ['spells', 'spellProfiles', index] as const
  const seen = new Set<string>()
  for (const kind of ['cantrips', 'spellsKnown'] as const) {
    for (const [i, reference] of profile[kind].entries()) {
      const key = getSpellReferenceKey(reference)
      if (
        seen.has(key) ||
        !getSpellNameKey(reference) ||
        (reference.includes('|') && !isSourceQualifiedSpellReference(reference))
      )
        invalid.push([...path, kind, i])
      seen.add(key)
    }
  }
  const ownedFixed = new Set(
    Object.entries(character.provenance.spells).flatMap(([name, tags]) =>
      tags
        .filter((tag) => isSpecialSpellGrant(tag) && tag.sourceType !== 'manual')
        .map((tag) => getSpellReferenceKey(getSpellNameKey(name), tag.grantSource ?? '')),
    ),
  )
  const fixed = new Set<string>()
  for (const [i, reference] of (profile.fixedSpells ?? []).entries()) {
    const key = getSpellReferenceKey(reference)
    if (fixed.has(key) || !seen.has(key) || !ownedFixed.has(key))
      invalid.push([...path, 'fixedSpells', i])
    fixed.add(key)
  }
  for (const key of ownedFixed)
    if (!fixed.has(key) || !seen.has(key)) invalid.push([...path, 'fixedSpells'])
  return invalid
}
