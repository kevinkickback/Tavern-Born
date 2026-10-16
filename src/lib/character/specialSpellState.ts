import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import {
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'

type SpellKind = 'cantrips' | 'spellsKnown'
type SpellLookup = Readonly<Record<string, Spell5e>>

/** An unresolved manual name never borrows a printing or kind from the catalog. */
export function resolveSpecialSpellKind(
  reference: string,
  spellsByKey?: SpellLookup,
): SpellKind | undefined {
  if (!spellsByKey || !isSourceQualifiedSpellReference(reference)) return undefined
  const spell = resolveSpellReference(reference, spellsByKey)
  const target = parseSpellReference(reference)
  if (
    !spell ||
    normalizeOwnerIdentity(spell.name) !== normalizeOwnerIdentity(target.name) ||
    normalizeOwnerIdentity(spell.source) !== normalizeOwnerIdentity(target.source)
  )
    return undefined
  return spell.level === 0 ? 'cantrips' : spell.level > 0 ? 'spellsKnown' : undefined
}

export function getSpecialSpellKind(
  profile: SpellProfile | undefined,
  reference: string,
): SpellKind | undefined {
  const key = getSpellReferenceKey(reference)
  const cantrip = profile?.cantrips.some((value) => getSpellReferenceKey(value) === key)
  const known = profile?.spellsKnown.some((value) => getSpellReferenceKey(value) === key)
  return cantrip === known ? undefined : cantrip ? 'cantrips' : 'spellsKnown'
}

/** All special owners share the target's current kind; changing it never changes ownership. */
export function setSpecialSpellKind(
  profile: SpellProfile,
  reference: string,
  kind: SpellKind,
): SpellProfile {
  const key = getSpellReferenceKey(reference)
  if (getSpecialSpellKind(profile, reference) === kind) return profile
  return {
    ...profile,
    cantrips: [
      ...profile.cantrips.filter((value) => getSpellReferenceKey(value) !== key),
      ...(kind === 'cantrips' ? [reference] : []),
    ],
    spellsKnown: [
      ...profile.spellsKnown.filter((value) => getSpellReferenceKey(value) !== key),
      ...(kind === 'spellsKnown' ? [reference] : []),
    ],
  }
}

export function refreshSpecialSpellKinds(
  character: Character,
  spellsByKey?: SpellLookup,
  rawSpellsByKey?: SpellLookup,
): Character {
  let changed = false
  const spellProfiles = character.spells.spellProfiles.map((profile) => {
    if (profile.id !== SPECIAL_SPELL_PROFILE_ID) return profile
    let current = profile
    for (const reference of [...profile.cantrips, ...profile.spellsKnown]) {
      const kind =
        resolveSpecialSpellKind(reference, spellsByKey) ??
        resolveSpecialSpellKind(reference, rawSpellsByKey)
      if (kind) current = setSpecialSpellKind(current, reference, kind)
    }
    changed ||= current !== profile
    return current
  })
  return changed ? { ...character, spells: { ...character.spells, spellProfiles } } : character
}
