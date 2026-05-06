import { useMemo } from 'react'
import { useProvenanceMutations } from '@/hooks/character/useProvenanceMutations'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import { resolveRaceAsiChoicesInLedger } from '@/lib/provenance'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/**
 * Integration test harness that composes all six provenance mutation domains
 * with the provenance row derivation hook.
 *
 * **Do not call from production pages.** Production pages should call the individual
 * `use*ProvenanceMutations` hooks directly. Use this hook in integration tests
 * that need cross-domain provenance interactions (e.g. apply race + class + verify ledger).
 */
export function useProvenance() {
  const character = useCharacterStore((state) => state.activeCharacter)

  const ledger = useMemo(() => {
    const raw = character?.provenance ?? emptyProvenance()
    return resolveRaceAsiChoicesInLedger(raw, character?.raceAsiChoices ?? [])
  }, [character])

  const mutations = useProvenanceMutations()
  const rows = useProvenanceRows({ ledger })

  return {
    ledger,
    ...mutations,
    ...rows,
  }
}
