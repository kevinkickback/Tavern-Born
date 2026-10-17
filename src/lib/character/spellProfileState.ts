import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import type { NativeSpellLookups } from '@/lib/calculations/nativeRacialSpellChoices'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles.profiles'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { syncSpellProfiles } from './commands/spellCommands'
import { refreshSpecialSpellKinds } from './specialSpellState'

/** Shared read projection and atomic write state for exact resolved spell rules. */
export function deriveSpellProfileState(
  character: Character,
  classesById: Map<string, Class5e>,
  raceData?: Pick<Race5e, 'name' | 'source' | 'additionalSpells'>,
  raceResolution?: ResolvedRaceReference,
  options?: NativeSpellLookups & {
    preserveNonracialProfiles?: boolean
  },
): Character {
  character = refreshSpecialSpellKinds(character, options?.spellsByKey, options?.rawSpellsByKey)
  character = refreshNativeRacialSpellState(character, raceResolution, options)
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
