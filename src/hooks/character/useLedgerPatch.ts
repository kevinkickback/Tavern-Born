import { useCallback } from 'react'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { useCharacterStore } from '@/store/characterStore'

/**
 * Returns a stable `patchLedger` callback that writes a new ledger value
 * to the active character via `updateCharacter`.
 *
 * Use in provenance mutation hooks as a replacement for the repeated inline
 * `updateCharacter(character.id, { provenance: newLedger })` pattern.
 */
export function useLedgerPatch(): (newLedger: ProvenanceLedger) => void {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  return useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character) return
      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, updateCharacter],
  )
}
