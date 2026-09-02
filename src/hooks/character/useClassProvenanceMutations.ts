import { useCallback, useMemo } from 'react'
import { useItemLookup } from '@/hooks/data/useGameData'
import {
  applyClassEquipmentChoiceCommand,
  applyClassSelectionCommand,
} from '@/lib/character/commands/classCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

export function useClassProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyClassSelection = useCallback(
    (
      cls: {
        name: string
        source?: string
        proficiency?: string[]
        startingEquipment?: unknown
        startingProficiencies?: {
          armor?: string[]
          weapons?: string[]
          tools?: string[]
          toolProficiencies?: Record<
            string,
            number | boolean | { choose?: { from?: string[]; count?: number } }
          >[]
          skills?: Array<string | Record<string, unknown>>
        }
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return
      const result = applyClassSelectionCommand(character, ledger, cls, subclass, itemLookup)
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter, itemLookup],
  )

  const applyClassEquipmentChoice = useCallback(
    (
      cls: {
        name: string
        source?: string
        startingEquipment?: unknown
      },
      blockIndex: number,
      choice: string,
    ) => {
      if (!character) return
      const result = applyClassEquipmentChoiceCommand(
        character,
        ledger,
        cls,
        blockIndex,
        choice,
        itemLookup,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, itemLookup, updateCharacter],
  )

  return { applyClassSelection, applyClassEquipmentChoice }
}
