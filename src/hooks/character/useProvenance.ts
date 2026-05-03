import { useCallback, useMemo } from 'react'
import { useProvenanceMutations } from '@/hooks/character/useProvenanceMutations'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'

const EMPTY_ITEMS: never[] = []
const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

function getLedger(character: Character | null): ProvenanceLedger {
  return character?.provenance ?? emptyProvenance()
}

export function useProvenance() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const items = gameData?.items ?? EMPTY_ITEMS
  const itemsBase = gameData?.itemsBase ?? EMPTY_ITEMS

  const ledger = useMemo(() => getLedger(character), [character?.provenance, character])

  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP

  const patch = useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character) return
      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, updateCharacter],
  )

  const mutations = useProvenanceMutations({
    character,
    ledger,
    itemLookup,
    items,
    itemsBase,
    patch,
    updateCharacter,
  })

  const rows = useProvenanceRows({
    ledger,
    raceAsiChoices: character?.raceAsiChoices,
    backgroundAsiChoices: character?.backgroundAsiChoices,
  })

  return {
    ledger,
    ...mutations,
    ...rows,
  }
}
