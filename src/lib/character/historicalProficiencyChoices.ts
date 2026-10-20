import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import type { Character } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

export function getHistoricalProficiencyRule(choiceId: string) {
  const relation = decodeClassProficiencyChoiceId(choiceId)
  const rule = relation && classProficiencyRule(relation.target)
  return relation?.domain === 'skills' &&
    rule?.proficiencyAtGain &&
    rule.domains.some((row) => row.domain === 'skills')
    ? rule
    : undefined
}
/** Capacity is conditional on an explicit acquisition answer, never today's proficiency. */
export function resolveHistoricalProficiencyChoice(
  character: Character,
  choice: NormalizedCharacterChoice,
): NormalizedCharacterChoice {
  if (!getHistoricalProficiencyRule(choice.id)) return choice
  const setup = character.classChoiceSelections?.find(
    (row) => row.choiceId === choice.id,
  )?.proficiencyAtGain
  if (!setup || setup.alreadyProficient) return choice
  return {
    ...choice,
    minimumSelections: 0,
    maximumSelections: 0,
    selectionCountByLevel: Array(20).fill(0),
  }
}
