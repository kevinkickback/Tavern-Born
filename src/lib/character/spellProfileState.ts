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
): Character {
  const profiles = ensureSpellProfiles(character, classesById, raceData, {
    raceResolution,
    preserveUnavailableClassProfiles: true,
  })
  const result = syncSpellProfiles(character, character.provenance, profiles, raceResolution)
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}
