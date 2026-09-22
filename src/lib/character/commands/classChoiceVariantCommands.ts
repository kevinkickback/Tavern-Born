import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  getAllCharacterClassChoices,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  reconcileClassChoiceFeatMirror,
  reconcileClassChoiceSelectionGrants,
} from './classChoiceCommands'
import type { CharacterCommandResult } from './commandResult'

function uniqueChoices(choices: readonly NormalizedCharacterChoice[]): NormalizedCharacterChoice[] {
  return [...new Map(choices.map((choice) => [choice.id, choice])).values()]
}

/**
 * Activates the original or replacement side of optional class-feature choices atomically.
 * Dormant selections are retained so toggling the rule back restores the prior choice, while
 * features and feat mirrors are rebuilt from active selections only.
 */
export function reconcileOptionalClassFeatureChoicesCommand(
  character: Character,
  ledger: ProvenanceLedger,
  classes: readonly Class5e[],
  includeVariants: boolean,
): CharacterCommandResult {
  const allChoices: NormalizedCharacterChoice[] = []
  const activeChoiceIds = new Set<string>()

  for (const entry of character.classProgression) {
    const classData = classes.find(
      (candidate) =>
        candidate.name === entry.name && (candidate.source ?? '') === (entry.source ?? ''),
    )
    if (!classData) continue
    const subclass = getSelectedSubclassData(classData, entry)
    allChoices.push(...getAllCharacterClassChoices(classData, subclass))
    for (const choice of getCharacterClassChoices(classData, subclass, includeVariants)) {
      activeChoiceIds.add(choice.id)
    }
  }

  const scopedChoices = uniqueChoices(allChoices)
  const scopedChoiceIds = new Set(scopedChoices.map((choice) => choice.id))
  const classChoiceSelections: CharacterClassChoiceSelection[] = (
    character.classChoiceSelections ?? []
  ).map((selection) => {
    if (!scopedChoiceIds.has(selection.choiceId)) return selection
    if (!activeChoiceIds.has(selection.choiceId)) return { ...selection, inactive: true }
    const { inactive: _inactive, ...activeSelection } = selection
    return activeSelection
  })
  const grants = reconcileClassChoiceSelectionGrants(character, ledger, classChoiceSelections)
  let workingCharacter: Character = {
    ...character,
    classChoiceSelections,
    features: grants.features,
    provenance: grants.provenanceUpdate,
  }
  let provenanceUpdate = grants.provenanceUpdate
  let characterPatch: Partial<Character> = {
    classChoiceSelections,
    features: grants.features,
  }

  for (const choice of scopedChoices) {
    if (choice.kind !== 'feat') continue
    const selection = classChoiceSelections.find(
      (candidate) => candidate.choiceId === choice.id && !candidate.inactive,
    )
    const featMirror = reconcileClassChoiceFeatMirror(
      workingCharacter,
      provenanceUpdate,
      choice,
      selection,
    )
    characterPatch = { ...characterPatch, ...featMirror.characterPatch }
    provenanceUpdate = featMirror.provenanceUpdate
    workingCharacter = {
      ...workingCharacter,
      ...featMirror.characterPatch,
      provenance: provenanceUpdate,
    }
  }

  return { characterPatch, provenanceUpdate }
}
