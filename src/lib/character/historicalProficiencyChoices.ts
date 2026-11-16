import {
  canonicalProficiencyName,
  decodeClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import {
  classProficiencyRule,
  getClassProficiencyRuleDomain,
} from '@/lib/5etools/classProficiencyRules'
import { getFixedProficiencyId } from '@/lib/5etools/fixedProficiencyAddress'
import type { Character } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

export function getHistoricalProficiencyRule(choiceId: string) {
  const relation = decodeClassProficiencyChoiceId(choiceId)
  const rule = relation && classProficiencyRule(relation.target)
  if (
    relation?.domain !== 'skills' &&
    relation?.domain !== 'savingThrows' &&
    relation?.domain !== 'tools'
  )
    return undefined
  const domain = getClassProficiencyRuleDomain(rule, relation)
  const proficiencyAtGain = domain && (domain.trigger ?? rule?.proficiencyAtGain)
  return proficiencyAtGain ? { proficiencyAtGain } : undefined
}
export function getAutomaticToolFallback(choiceId: string) {
  const relation = decodeClassProficiencyChoiceId(choiceId)
  return relation?.domain === 'tools' && relation.trigger
    ? { ...relation, trigger: relation.trigger }
    : undefined
}

/** Read from the current proficiency projection, leaving out this feature's own fixed grant. */
export function getProficiencyAtGain(character: Character, choiceId: string) {
  const saved = character.classChoiceSelections?.find(
    (row) => row.choiceId === choiceId,
  )?.proficiencyAtGain
  const relation = getAutomaticToolFallback(choiceId)
  if (saved || !relation) return saved
  const name = relation.trigger
  const ownGrant = getFixedProficiencyId(relation)
  const tags = character.provenance.proficiencies.tools[name] ?? []
  return {
    name,
    alreadyProficient:
      character.proficiencies.tools.some((tool) => canonicalProficiencyName(tool) === name) &&
      (!tags.length || tags.some((tag) => tag.grantVariant !== ownGrant)),
  }
}

export function resolveHistoricalProficiencyChoice(
  character: Character,
  choice: NormalizedCharacterChoice,
): NormalizedCharacterChoice {
  if (!getHistoricalProficiencyRule(choice.id)) return choice
  const setup = getProficiencyAtGain(character, choice.id)
  if (!setup || setup.alreadyProficient) return choice
  return {
    ...choice,
    minimumSelections: 0,
    maximumSelections: 0,
    selectionCountByLevel: Array(20).fill(0),
  }
}
