import { isManagedClassSpellProfile } from '@/lib/character/managedClassSpellIdentity'
import type { ManagedClassSpellStatus } from '@/lib/character/managedClassSpells'
import type { ClassFixedSpellStatus } from '@/lib/character/optionalClassFixedSpells'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { SpellProfile } from '@/types/character'
import { getSpellReferenceKey } from './spellIdentity'

/** Arcanum casts without ordinary preparation. Specialty notes alone do not grant preparation. */
export function hasActiveMysticArcanum(
  statuses: readonly ManagedClassSpellStatus[],
  reference: string,
  profile: SpellProfile,
): boolean {
  const key = getSpellReferenceKey(reference)
  return statuses.some(
    ({ active, choice }) =>
      active &&
      choice.slot[1] === 'class-arcanum' &&
      isManagedClassSpellProfile(choice.slot, profile) &&
      getSpellReferenceKey(choice.target.name, choice.target.source) === key,
  )
}

/** Only current projected grants supply casting semantics; saved membership alone supplies none. */
export function getManagedSpellCastingNotes(
  statuses: readonly ManagedClassSpellStatus[],
  reference: string,
  profile?: SpellProfile,
): string[] {
  const key = getSpellReferenceKey(reference)
  return [
    ...new Set(
      statuses.flatMap((status) =>
        status.active &&
        status.castingNote &&
        (!profile || isManagedClassSpellProfile(status.choice.slot, profile)) &&
        getSpellReferenceKey(status.choice.target.name, status.choice.target.source) === key
          ? [status.castingNote]
          : [],
      ),
    ),
  ]
}

export function isFixedClassSpellProfile(status: ClassFixedSpellStatus, profile: SpellProfile) {
  return (
    profile.type === 'class' &&
    normalizeOwnerIdentity(profile.className) === status.owner[1] &&
    normalizeOwnerIdentity(profile.classSource) === status.owner[2]
  )
}

export function getFixedClassSpellCastingNotes(
  statuses: readonly ClassFixedSpellStatus[],
  reference: string,
  profile?: SpellProfile,
): string[] {
  const key = getSpellReferenceKey(reference)
  return statuses.flatMap((status) =>
    status.active &&
    status.castingNote &&
    (!profile || isFixedClassSpellProfile(status, profile)) &&
    getSpellReferenceKey(status.reference) === key
      ? [status.castingNote]
      : [],
  )
}
