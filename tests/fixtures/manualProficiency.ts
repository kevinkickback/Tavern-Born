import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { addGrant, makeSourceTag, normalizeKey } from '@/lib/provenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

/** Explicit independent manual state admitted by the current character format. */
export function manualExpertiseFixtureGrant(
  character: Character,
  ledger: ProvenanceLedger,
  name: string,
): CharacterCommandResult {
  const key = normalizeKey(name)
  return {
    characterPatch: {
      proficiencies: {
        ...character.proficiencies,
        expertise: [...new Set([...character.proficiencies.expertise, key])],
      },
    },
    provenanceUpdate: addGrant(
      ledger,
      'expertise',
      key,
      makeSourceTag('manual', 'User Choice', 'choice'),
    ),
  }
}
