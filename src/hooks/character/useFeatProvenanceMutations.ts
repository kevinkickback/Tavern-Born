import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  clearFeatOptionsCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  type FeatOptionTarget,
  removeFeatChoiceCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  resolveFeatChoiceCommand,
  resolveProficiencyChoiceCommand,
  type SelectedFeat,
} from '@/lib/character/commands/featCommands'
import { projectProficiencyCommandResult } from '@/lib/character/commands/proficiencyProjection'
import { canChangeFeatExpertise } from '@/lib/character/featExpertiseSelections'
import { canChangeSkilledSkills } from '@/lib/character/featSkillSelections'
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'

export function useFeatProvenanceMutations() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const { feats } = useFilteredGameData()
  const calculation = useCharacterCalculationContext(character)
  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyCommand = useCallback(
    (result: CharacterCommandResult) => {
      if (
        !character ||
        (Object.keys(result.characterPatch).length === 0 && result.provenanceUpdate === ledger)
      )
        return
      const projected = projectProficiencyCommandResult(
        character,
        result,
        calculation?.classChoices.catalogs,
      )
      updateCharacter(character.id, {
        ...projected.characterPatch,
        provenance: projected.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter, calculation],
  )

  const replaceFeatSelections = useCallback(
    (selectedFeats: SelectedFeat[]) => {
      if (!character) return
      applyCommand(replaceFeatSelectionsCommand(character, ledger, selectedFeats))
    },
    [character, ledger, applyCommand],
  )

  const replaceBonusFeatSelections = useCallback(
    (selectedFeats: Array<{ name: string; source?: string }>) => {
      if (!character) return
      applyCommand(replaceBonusFeatSelectionsCommand(character, ledger, selectedFeats))
    },
    [character, ledger, applyCommand],
  )

  const resolveFeatChoiceSelection = useCallback(
    (choiceId: string, feat: { name: string; source?: string }) => {
      if (!character) return
      applyCommand(resolveFeatChoiceCommand(character, ledger, choiceId, feat))
    },
    [character, ledger, applyCommand],
  )

  const removeFeatChoiceSelection = useCallback(
    (choiceId: string, featName: string, featSource?: string) => {
      if (!character) return
      applyCommand(removeFeatChoiceCommand(character, ledger, choiceId, featName, featSource))
    },
    [character, ledger, applyCommand],
  )

  const resolveChoiceSelection = useCallback(
    (
      domain: Extract<ChoiceDomain, 'skills' | 'languages' | 'tools' | 'armor' | 'weapons'>,
      itemName: string,
      adding: boolean,
      choiceId?: string,
    ) => {
      if (!character) return
      applyCommand(
        resolveProficiencyChoiceCommand(character, ledger, domain, itemName, adding, choiceId),
      )
    },
    [character, ledger, applyCommand],
  )

  const commitFeatWithOptions = useCallback(
    (feat: FeatOptionTarget, selections: FeatOptionSelections, allSpells?: Spell5e[]) => {
      if (!character) return
      if (
        !canChangeSkilledSkills(
          character,
          calculation?.character ?? character,
          feat,
          selections,
          feats,
        )
      ) {
        toast.info('Choose skills you are not already proficient in.')
        return
      }
      if (
        !canChangeFeatExpertise(
          character,
          calculation?.character ?? character,
          feat,
          selections,
          feats,
        )
      ) {
        toast.info('Expertise needs a current proficient skill without another Expertise grant.')
        return
      }
      applyCommand(commitFeatOptionsCommand(character, ledger, feat, selections, allSpells))
    },
    [character, ledger, applyCommand, calculation, feats],
  )

  const editFeatWithOptions = useCallback(
    (
      feat: FeatOptionTarget,
      oldOptions: FeatOptionSelections,
      newSelections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return
      if (
        !canChangeSkilledSkills(
          character,
          calculation?.character ?? character,
          feat,
          newSelections,
          feats,
        )
      ) {
        toast.info('Choose skills you are not already proficient in.')
        return
      }
      if (
        !canChangeFeatExpertise(
          character,
          calculation?.character ?? character,
          feat,
          newSelections,
          feats,
        )
      ) {
        toast.info('Expertise needs a current proficient skill without another Expertise grant.')
        return
      }
      applyCommand(
        editFeatOptionsCommand(character, ledger, feat, oldOptions, newSelections, allSpells),
      )
    },
    [character, ledger, applyCommand, calculation, feats],
  )

  const clearFeatWithOptions = useCallback(
    (feat: FeatOptionTarget, oldOptions: FeatOptionSelections) => {
      if (!character) return
      applyCommand(clearFeatOptionsCommand(character, ledger, feat, oldOptions))
    },
    [character, ledger, applyCommand],
  )

  return {
    replaceFeatSelections,
    replaceBonusFeatSelections,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    resolveChoiceSelection,
    commitFeatWithOptions,
    editFeatWithOptions,
    clearFeatWithOptions,
  }
}
