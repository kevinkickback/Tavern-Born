import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/**
 * Self-contained hook that exposes the provenance ledger and all derived row data.
 * Use in pages that need to read provenance state (ledger, source rows) but not mutate it.
 */
export function useProvenanceLedger() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const calculation = useCharacterCalculationContext(character)

  const ledger = useMemo(() => {
    return calculation?.character.provenance ?? character?.provenance ?? emptyProvenance()
  }, [character, calculation])

  const rows = useProvenanceRows({ ledger, selection: character })

  return { ledger, ...rows }
}
