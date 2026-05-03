import { useMemo } from 'react'
import { useClassProvenance } from '@/hooks/character/useClassProvenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

/** Self-contained wrapper around {@link useClassProvenance} that reads all params from stores. */
export function useClassProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  return useClassProvenance({ character, ledger, itemLookup, updateCharacter })
}
