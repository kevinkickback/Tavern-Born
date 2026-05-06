import { useMemo } from 'react'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import { resolveRaceAsiChoicesInLedger } from '@/lib/provenance'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/**
 * Self-contained hook that exposes the provenance ledger and all derived row data.
 * Use in pages that need to read provenance state (ledger, source rows) but not mutate it.
 */
export function useProvenanceLedger() {
  const character = useCharacterStore((s) => s.activeCharacter)

  const ledger = useMemo(() => {
    const raw = character?.provenance ?? emptyProvenance()
    return resolveRaceAsiChoicesInLedger(raw, character?.raceAsiChoices ?? [])
  }, [character])

  const rows = useProvenanceRows({ ledger })

  return { ledger, ...rows }
}
