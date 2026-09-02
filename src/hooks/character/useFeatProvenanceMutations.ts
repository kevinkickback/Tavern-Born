import { useCallback, useMemo } from 'react'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  applyFeatSelectionCommand,
  applyOptionalFeatureSelectionCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  type FeatOptionTarget,
  removeFeatChoiceCommand,
  removeFeatProvenanceCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  replaceOptionalFeatureSelectionsCommand,
  resolveFeatChoiceCommand,
  resolveProficiencyChoiceCommand,
  retractFeatOptionsCommand,
  type SelectedFeat,
} from '@/lib/character/commands/featCommands'
import type { ChoiceDomain, ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'

export function useFeatProvenanceMutations() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyCommand = useCallback(
    (result: CharacterCommandResult) => {
      if (!character) return
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter],
  )

  const applyFeatSelection = useCallback(
    (featName: string, featSource: string | undefined) => {
      if (!character) return
      applyCommand(applyFeatSelectionCommand(ledger, featName, featSource))
    },
    [character, ledger, applyCommand],
  )

  const removeFeatProvenance = useCallback(
    (featName: string) => {
      if (!character) return
      applyCommand(removeFeatProvenanceCommand(ledger, featName))
    },
    [character, ledger, applyCommand],
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

  const applyOptionalFeatureSelection = useCallback(
    (
      featureName: string,
      featureSource: string | undefined,
      grantingSourceName: string,
      grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
    ) => {
      if (!character) return
      applyCommand(
        applyOptionalFeatureSelectionCommand(
          ledger,
          featureName,
          featureSource,
          grantingSourceName,
          grantingSourceType,
        ),
      )
    },
    [character, ledger, applyCommand],
  )

  const replaceOptionalFeatureSelections = useCallback(
    (
      replacedFeatures: Array<{ name: string; source?: string }>,
      selectedFeatures: Array<{ name: string; source?: string }>,
      grantingSourceName: string,
      grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
    ) => {
      if (!character) return
      applyCommand(
        replaceOptionalFeatureSelectionsCommand(
          character,
          ledger,
          replacedFeatures,
          selectedFeatures,
          grantingSourceName,
          grantingSourceType,
        ),
      )
    },
    [character, ledger, applyCommand],
  )

  const resolveFeatChoiceSelection = useCallback(
    (choiceId: string, feat: { name: string; source?: string }) => {
      if (!character) return
      applyCommand(resolveFeatChoiceCommand(ledger, choiceId, feat))
    },
    [character, ledger, applyCommand],
  )

  const removeFeatChoiceSelection = useCallback(
    (choiceId: string, featName: string) => {
      if (!character) return
      applyCommand(removeFeatChoiceCommand(ledger, choiceId, featName))
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
      applyCommand(commitFeatOptionsCommand(character, ledger, feat, selections, allSpells))
    },
    [character, ledger, applyCommand],
  )

  const retractFeatOptionGrants = useCallback(
    (feat: FeatOptionTarget, selections: FeatOptionSelections) => {
      if (!character) return
      applyCommand(retractFeatOptionsCommand(character, ledger, feat, selections))
    },
    [character, ledger, applyCommand],
  )

  const editFeatWithOptions = useCallback(
    (
      feat: FeatOptionTarget,
      oldOptions: FeatOptionSelections,
      newSelections: FeatOptionSelections,
      allSpells?: Spell5e[],
    ) => {
      if (!character) return
      applyCommand(
        editFeatOptionsCommand(character, ledger, feat, oldOptions, newSelections, allSpells),
      )
    },
    [character, ledger, applyCommand],
  )

  return {
    applyFeatSelection,
    removeFeatProvenance,
    replaceFeatSelections,
    replaceBonusFeatSelections,
    applyOptionalFeatureSelection,
    replaceOptionalFeatureSelections,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    resolveChoiceSelection,
    commitFeatWithOptions,
    retractFeatOptionGrants,
    editFeatWithOptions,
  }
}
