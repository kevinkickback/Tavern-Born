import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useItemLookup } from '@/hooks/data/useGameData'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassEquipmentChoiceCommand,
  applyClassSelectionCommand,
} from '@/lib/character/commands/classCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'

export function useClassProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const sourceData = useGameDataStore((state) => state.gameData)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()
  const calculationContext = useCharacterCalculationContext(character)

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyClassSelection = useCallback(
    (
      cls: {
        name: string
        source: string
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
      const result = applyClassSelectionCommand(character, ledger, cls, subclass, itemLookup, {
        raceResolution: calculationContext?.raceResolution,
        spellsByKey: calculationContext?.lookups.primary.spellsByKey,
        rawSpellsByKey: calculationContext?.lookups.raw.spellsByKey,
        classChoiceFeatureCatalogs: calculationContext?.classChoices.catalogs,
        spellContext: calculationContext?.classChoices.spellContext,
      })
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter, itemLookup, calculationContext],
  )

  const applyClassEquipmentChoice = useCallback(
    (
      cls: {
        name: string
        source: string
        startingEquipment?: unknown
      },
      blockIndex: number,
      choice: string,
      genericSelections?: Readonly<Record<string, string>>,
    ) => {
      if (!character) return
      const result = applyClassEquipmentChoiceCommand(
        character,
        ledger,
        cls,
        blockIndex,
        choice,
        itemLookup,
        genericSelections,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, itemLookup, updateCharacter],
  )

  const applyClassChoiceSelection = useCallback(
    (choice: NormalizedCharacterChoice, selected: readonly NormalizedChoiceOptionReference[]) => {
      const latest = useCharacterStore.getState().activeCharacter
      if (
        !hasCurrentCharacterSourceContext(
          latest,
          character,
          useGameDataStore.getState().gameData,
          sourceData,
        )
      )
        throw new RangeError('Source rules changed. Review the current choice before confirming.')
      if (!latest) return
      const result = applyClassChoiceSelectionWithGrantsCommand(
        latest,
        latest.provenance,
        choice,
        selected,
        calculationContext?.classChoices,
      )
      if (Object.keys(result.characterPatch).length === 0) return
      updateCharacter(latest.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, sourceData, updateCharacter, calculationContext],
  )

  const retainSavedFeatureOptions = useCallback(
    (choiceId: string, keys: readonly string[], expectedSelectionHandle?: string) => {
      if (!character) return
      const latest = useCharacterStore.getState().activeCharacter
      if (!latest || latest.id !== character.id)
        throw new RangeError('The active character changed. Review the saved choice.')
      const result = retainSavedFeatureOptionsCommand(
        latest,
        latest.provenance,
        choiceId,
        keys,
        hasCurrentCharacterSourceContext(
          latest,
          character,
          useGameDataStore.getState().gameData,
          sourceData,
        )
          ? calculationContext?.classChoices
          : undefined,
        expectedSelectionHandle,
      )
      if (Object.keys(result.characterPatch).length === 0) return
      updateCharacter(latest.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, sourceData, updateCharacter, calculationContext],
  )

  return {
    setHistoricalProficiencySetup: (
      choice: NormalizedCharacterChoice,
      alreadyProficient: boolean,
    ) => {
      if (!character || !calculationContext?.classChoices.catalogs) return
      const result = setHistoricalProficiencySetupCommand(
        character,
        ledger,
        choice,
        alreadyProficient,
        calculationContext.classChoices.catalogs,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    applyClassSelection,
    applyClassEquipmentChoice,
    applyClassChoiceSelection,
    retainSavedFeatureOptions,
  }
}
