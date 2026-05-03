import { useMemo } from 'react'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/**
 * Self-contained hook that exposes the provenance ledger and all derived row data.
 * Use in pages that need to read provenance state (ledger, source rows) but not mutate it.
 */
export function useProvenanceLedger() {
  const character = useCharacterStore((s) => s.activeCharacter)

  const ledger = useMemo(() => character?.provenance ?? emptyProvenance(), [character])

  const rows = useProvenanceRows({
    ledger,
    raceAsiChoices: character?.raceAsiChoices,
    backgroundAsiChoices: character?.backgroundAsiChoices,
  })

  return { ledger, ...rows }
}
