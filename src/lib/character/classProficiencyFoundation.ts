import {
  canonicalProficiencyName,
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import {
  getInvalidClassProficiencySelectionIds,
  isValidClassProficiencySelection,
} from '@/lib/schema/classProficiencyValidation'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getEffectiveOwnerProficiencyChoices } from './classProficiencyAuthority'
import {
  grantClassProficiencySelection,
  stripClassProficiencyGrants,
} from './classProficiencyOwnership'
import { hasProficiencyCatalogTarget } from './classProficiencyVocabulary'
import { refreshFeatExpertiseState, stripFeatExpertiseGrants } from './featExpertiseSelections'
import { getCurrentFixedProficiencies } from './fixedProficiencyAuthority'
import { grantFixedProficiencies, stripFixedProficiencyGrants } from './fixedProficiencyOwnership'

interface CurrentSelection {
  selection: CharacterClassChoiceSelection
  choice: NormalizedCharacterChoice
}

/** Shared read/command projection: independent base -> paired foundations -> feat -> class Expertise. */
export function projectOwnedProficiencies(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const independent = stripFeatExpertiseGrants(
    stripClassProficiencyGrants(stripFixedProficiencyGrants(character)),
  )
  const fixed = getCurrentFixedProficiencies(character, catalogs)
  const invalid = getInvalidClassProficiencySelectionIds(character.classChoiceSelections ?? [])
  const choices = new Map(
    character.classProgression
      .flatMap((owner) => getEffectiveOwnerProficiencyChoices(character, owner, catalogs))
      .map((choice) => [choice.id, choice]),
  )
  const current: CurrentSelection[] = []
  for (const selection of character.classChoiceSelections ?? []) {
    const choice = choices.get(selection.choiceId)
    if (choice && !invalid.has(selection.choiceId) && isValidClassProficiencySelection(selection))
      current.push({ selection, choice })
  }
  current.sort(
    (left, right) =>
      left.choice.level - right.choice.level || left.choice.id.localeCompare(right.choice.id),
  )
  const liveSelected = (selection: CharacterClassChoiceSelection) =>
    selection.selected.filter((option) => hasProficiencyCatalogTarget(option, catalogs))
  let foundations = grantFixedProficiencies(independent, fixed, 'foundations', catalogs)
  for (const { selection } of current) {
    const selected = liveSelected(selection)
    if (selected.length)
      foundations = grantClassProficiencySelection(
        foundations,
        { ...selection, selected },
        'foundations',
      )
  }
  let effective = grantFixedProficiencies(
    refreshFeatExpertiseState(foundations, catalogs?.featExpertiseFeats ?? []),
    fixed,
    'expertise',
    catalogs,
  )
  for (const { selection } of current) {
    const relation = decodeClassProficiencyChoiceId(selection.choiceId)!
    if (relation.domain !== 'expertise') continue
    const domain = classProficiencyRule(relation.target)!.domains.find(
      (row) => row.domain === 'expertise',
    )!
    const selected = liveSelected(selection).filter((option) => {
      const target = decodeProficiencyOption(option)!
      const underlying =
        target.proficiencyType === 'tool'
          ? foundations.proficiencies.tools
          : foundations.proficiencies.skills
      if (!underlying.some((value) => canonicalProficiencyName(value) === target.name)) return false
      if (
        domain.distinctEarlier &&
        current.some((other) => {
          if (other.selection.classLevel >= selection.classLevel) return false
          const prior = decodeClassProficiencyChoiceId(other.selection.choiceId)!
          return (
            prior.domain === 'expertise' &&
            JSON.stringify(prior.owner) === JSON.stringify(relation.owner) &&
            liveSelected(other.selection).some(
              (pick) => decodeProficiencyOption(pick)?.name === target.name,
            )
          )
        })
      )
        return false
      return true
    })
    if (selected.length)
      effective = grantClassProficiencySelection(effective, { ...selection, selected }, 'expertise')
  }
  return { independent, foundations, effective, current, fixed }
}
