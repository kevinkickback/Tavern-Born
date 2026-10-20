import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getEffectiveOwnerProficiencyChoices } from '@/lib/character/classProficiencyAuthority'
import { reconcileClassProficiencyGrants } from '@/lib/character/classProficiencyOwnership'
import { getHistoricalProficiencyRule } from '@/lib/character/historicalProficiencyChoices'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { isValidClassProficiencySelection } from '@/lib/schema/classProficiencyValidation'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { projectProficiencyCommandResult } from './proficiencyProjection'

/** Record/correct the player's acquisition fact explicitly; current proficiency never supplies it. */
export function setHistoricalProficiencySetupCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  alreadyProficient: boolean,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = character.classProgression
    .flatMap((owner) => getEffectiveOwnerProficiencyChoices(character, owner, catalogs))
    .find((row) => row.id === choice.id)
  const rule = current && getHistoricalProficiencyRule(current.id)
  if (!current || !rule || typeof alreadyProficient !== 'boolean')
    throw new RangeError('Current source rules cannot verify this proficiency setup.')
  const prior = character.classChoiceSelections?.find((row) => row.choiceId === current.id)
  const owner = character.classProgression.find(
    (row) =>
      row.name.trim().toLowerCase() === current.owner.name.trim().toLowerCase() &&
      row.source.trim().toLowerCase() === current.owner.source.trim().toLowerCase(),
  )!
  const selection: CharacterClassChoiceSelection = {
    choiceId: current.id,
    label: current.label,
    kind: 'proficiency',
    className: owner.name,
    classSource: owner.source,
    subclassName: current.owner.subclassName,
    subclassSource: current.owner.subclassSource,
    classLevel: current.level,
    proficiencyAtGain: { name: rule.proficiencyAtGain!, alreadyProficient },
    selected:
      alreadyProficient && prior?.proficiencyAtGain?.alreadyProficient ? prior.selected : [],
  }
  if (!isValidClassProficiencySelection(selection))
    throw new RangeError('The proficiency acquisition answer is invalid.')
  const selections = [
    ...(character.classChoiceSelections ?? []).filter((row) => row.choiceId !== current.id),
    selection,
  ]
  const reconciled = reconcileClassProficiencyGrants(character, ledger, selections)
  return projectProficiencyCommandResult(
    character,
    {
      characterPatch: {
        classChoiceSelections: selections,
        proficiencies: reconciled.proficiencies,
      },
      provenanceUpdate: reconciled.provenance!,
    },
    catalogs,
  )
}
