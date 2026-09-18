import { useCallback, useMemo } from 'react'
import {
  type ClassSpellSelectionInput,
  setClassSpellSelectionsAtLevel as setClassSpellSelectionsAtLevelCommand,
  swapClassSpellAtLevel as swapClassSpellAtLevelCommand,
} from '@/lib/character/commands/spellCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

export function useSpellProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const setClassSpellSelectionsAtLevel = useCallback(
    (
      className: string,
      classSource: string | undefined,
      classLevel: number,
      selections: ClassSpellSelectionInput[],
    ) => {
      if (!character || !classSource) return
      const result = setClassSpellSelectionsAtLevelCommand(character, ledger, {
        className,
        classSource,
        classLevel,
        selections,
      })
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter],
  )

  const swapClassSpellAtLevel = useCallback(
    (
      className: string,
      classSource: string | undefined,
      swapAtLevel: number,
      removedName: string,
      addedName: string,
      addedSpellSchool?: string,
    ) => {
      if (!character || !classSource) return
      const result = swapClassSpellAtLevelCommand(character, ledger, {
        className,
        classSource,
        swapAtLevel,
        removedName,
        addedName,
        addedSpellSchool,
      })
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter],
  )

  return {
    setClassSpellSelectionsAtLevel,
    swapClassSpellAtLevel,
  }
}
