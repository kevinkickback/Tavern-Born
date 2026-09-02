import { useCallback, useMemo } from 'react'
import { useItemLookup } from '@/hooks/data/useGameData'
import {
  applyBackgroundAbilityChoicesCommand,
  applyBackgroundSelectionCommand,
} from '@/lib/character/commands/backgroundCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Background5e } from '@/types/5etools'

export function useBackgroundProvenanceMutations() {
  // Domain mutation hook contract:
  // 1. Read character + ledger from store (via useLedgerPatch or direct store selectors).
  // 2. Reconcile: remove grants from the old source (reconcile* functions in lib/provenance).
  // 3. Apply: add grants from the new source (apply* functions in lib/provenance).
  // 4. Sync derived character fields (proficiencies, skills via mergeSkillState, equipment).
  // 5. Write via updateCharacter(character.id, patch) or patchLedger for ledger-only writes.
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyBackgroundSelection = useCallback(
    (
      bg: {
        name: string
        source?: string
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        startingEquipment?: unknown
        feats?: unknown[]
      },
      blockChoices: string[] = [],
    ) => {
      if (!character) return
      const result = applyBackgroundSelectionCommand(
        character,
        ledger,
        bg as Background5e,
        blockChoices,
        itemLookup,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter, itemLookup],
  )

  const applyBackgroundAbilityChoices = useCallback(
    (
      bg: { name: string; source?: string; ability?: unknown[] },
      blockIndex: number,
      choices: string[],
    ) => {
      if (!character) return
      const result = applyBackgroundAbilityChoicesCommand(
        character,
        ledger,
        bg as Background5e,
        blockIndex,
        choices,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter],
  )

  return { applyBackgroundSelection, applyBackgroundAbilityChoices }
}
