import { isManagedClassSpellProfile } from '@/lib/character/managedClassSpellIdentity'
import type { ManagedClassSpellStatus } from '@/lib/character/managedClassSpells'
import type { SpellProfile } from '@/types/character'
import { getSpellReferenceKey } from './spellIdentity'

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
