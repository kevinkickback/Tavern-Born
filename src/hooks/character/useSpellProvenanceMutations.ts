import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
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
  const calculationContext = useCharacterCalculationContext(character)

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
      const native = refreshNativeRacialSpellState(
        { ...character, ...result.characterPatch, provenance: result.provenanceUpdate },
        calculationContext?.raceResolution,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        spells: native.spells,
        provenance: native.provenance,
      })
    },
    [character, ledger, updateCharacter, calculationContext],
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
      const native = refreshNativeRacialSpellState(
        { ...character, ...result.characterPatch, provenance: result.provenanceUpdate },
        calculationContext?.raceResolution,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        spells: native.spells,
        provenance: native.provenance,
      })
    },
    [character, ledger, updateCharacter, calculationContext],
  )

  return {
    setClassSpellSelectionsAtLevel,
    swapClassSpellAtLevel,
  }
}
