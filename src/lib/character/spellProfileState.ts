import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { syncSpellProfiles } from './commands/spellCommands'

/** Shared read projection and atomic write state for exact resolved spell rules. */
export function deriveSpellProfileState(
  character: Character,
  classesById: Map<string, Class5e>,
  raceData?: Pick<Race5e, 'name' | 'source' | 'additionalSpells'>,
  raceResolution?: ResolvedRaceReference,
  options?: { preserveNonracialProfiles?: boolean },
): Character {
  const derivedProfiles = ensureSpellProfiles(
    character,
    options?.preserveNonracialProfiles ? undefined : classesById,
    raceData,
    {
      raceResolution,
      preserveUnavailableClassProfiles: true,
    },
  )
  const profiles = options?.preserveNonracialProfiles
    ? [
        ...character.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
        ...derivedProfiles.filter((profile) => profile.type === 'racial'),
      ]
    : derivedProfiles
  const result = syncSpellProfiles(character, character.provenance, profiles, raceResolution)
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}
