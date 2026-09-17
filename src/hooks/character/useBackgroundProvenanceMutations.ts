import { useCallback, useMemo } from 'react'
import { useItemLookup } from '@/hooks/data/useGameData'
import {
  applyBackgroundAbilityChoicesCommand,
  applyBackgroundSelectionCommand,
} from '@/lib/character/commands/backgroundCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Background5e } from '@/types/5etools'
import type { Character } from '@/types/character'

function buildBackgroundAbilityChoicesPatch(
  character: Character,
  ledger: ProvenanceLedger,
  background: Background5e,
  blockIndex: number,
  choices: string[],
): Partial<Character> {
  const result = applyBackgroundAbilityChoicesCommand(
    character,
    ledger,
    background,
    blockIndex,
    choices,
  )
  return {
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

export function useBackgroundProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const reconcileCharacter = useCharacterStore((s) => s.reconcileCharacter)
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
      genericSelections: Readonly<
        Record<string, string>
      > = character?.backgroundEquipmentItemChoices ?? {},
    ) => {
      if (!character) return
      const result = applyBackgroundSelectionCommand(
        character,
        ledger,
        bg as Background5e,
        blockChoices,
        itemLookup,
        genericSelections,
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
      updateCharacter(
        character.id,
        buildBackgroundAbilityChoicesPatch(
          character,
          ledger,
          bg as Background5e,
          blockIndex,
          choices,
        ),
      )
    },
    [character, ledger, updateCharacter],
  )

  const reconcileBackgroundAbilityChoices = useCallback(
    (
      bg: { name: string; source?: string; ability?: unknown[] },
      blockIndex: number,
      choices: string[],
    ) => {
      if (!character) return
      reconcileCharacter(
        character.id,
        buildBackgroundAbilityChoicesPatch(
          character,
          ledger,
          bg as Background5e,
          blockIndex,
          choices,
        ),
      )
    },
    [character, ledger, reconcileCharacter],
  )

  return {
    applyBackgroundSelection,
    applyBackgroundAbilityChoices,
    reconcileBackgroundAbilityChoices,
  }
}
