import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

export interface CharacterCommandResult {
  characterPatch: Partial<Character>
  provenanceUpdate: ProvenanceLedger
}
