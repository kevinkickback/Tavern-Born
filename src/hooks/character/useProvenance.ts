import { useCallback, useMemo } from 'react'
import { useProvenanceMutations } from '@/hooks/character/useProvenanceMutations'
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

const EMPTY_ITEMS: never[] = []

function getLedger(character: Character | null): ProvenanceLedger {
  return character?.provenance ?? emptyProvenance()
}

export function useProvenance() {
  const character = useCharacterStore((state) => {
    if (state.activeCharacter) return state.activeCharacter
    if (!state.activeCharacterId) return null
    return state.characters.find((entry) => entry.id === state.activeCharacterId) ?? null
  })
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const items = gameData?.items ?? EMPTY_ITEMS
  const itemsBase = gameData?.itemsBase ?? EMPTY_ITEMS

  const ledger = useMemo(() => getLedger(character), [character?.provenance, character])

  const itemLookup = useGameDataStore((s) => s.itemLookup)

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
