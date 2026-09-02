import { useCallback, useMemo } from 'react'
import { applyManualProficiencyCommand } from '@/lib/character/commands/equipmentCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

export function useEquipmentProvenanceMutations() {
  // Domain mutation hook contract:
  // 1. Read character + ledger from store (via useLedgerPatch or direct store selectors).
  // 2. Reconcile: remove grants from the old source (reconcile* functions in lib/provenance).
  // 3. Apply: add grants from the new source (apply* functions in lib/provenance).
  // 4. Sync derived character fields (proficiencies, skills via mergeSkillState, equipment).
  // 5. Write via updateCharacter(character.id, patch) or patchLedger for ledger-only writes.
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
