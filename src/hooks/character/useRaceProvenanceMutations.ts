import { useMemo } from 'react'
import { useRaceProvenance } from '@/hooks/character/useRaceProvenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

const EMPTY_ITEMS: never[] = []

/** Self-contained wrapper around {@link useRaceProvenance} that reads all params from stores. */
export function useRaceProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const items = gameData?.items ?? EMPTY_ITEMS
  const itemsBase = gameData?.itemsBase ?? EMPTY_ITEMS

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  return useRaceProvenance({ character, ledger, items, itemsBase, updateCharacter })
}
