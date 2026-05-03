import { useCallback, useMemo } from 'react'
import { useFeatProvenance } from '@/hooks/character/useFeatProvenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/** Self-contained wrapper around {@link useFeatProvenance} that reads all params from stores. */
export function useFeatProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const patch = useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character) return
      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, updateCharacter],
  )

  return useFeatProvenance({ character, ledger, patch, updateCharacter })
}
