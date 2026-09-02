import { useCallback, useMemo } from 'react'
import { applyManualProficiencyCommand } from '@/lib/character/commands/equipmentCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

export function useEquipmentProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyManualProficiencyToggle = useCallback(
    (
      domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons' | 'savingThrows',
      itemName: string,
      added: boolean,
    ) => {
      if (!character) return
      const result = applyManualProficiencyCommand(character, ledger, domain, itemName, added)
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter],
  )

  return { applyManualProficiencyToggle }
}
