import { normalizeAbilityName } from '@/lib/calculations/abilityScores'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { raceAbilityChoiceReadinessId } from '@/lib/navigation/readinessFocus'
import type { AbilityName, Character } from '@/types/character'
import { readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

export function validateOriginAbilityChoices(
  character: Character,
  calculation: CharacterCalculationContext,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  for (const [index, choice] of calculation.abilityScores.raceAsiData.choices.entries()) {
    const selected = (character.raceAsiChoices?.[index] ?? [])
      .map(normalizeAbilityName)
      .filter((ability): ability is AbilityName => ability !== null)
      .filter((ability, selectedIndex, all) => all.indexOf(ability) === selectedIndex)
    const valid = selected.filter((ability) => choice.from.includes(ability))
    if (valid.length < choice.count) {
      issues.push(
        readinessIssue(
          raceAbilityChoiceReadinessId(index),
          'blocking',
          'ability-scores',
          'Finish race ability choices',
          `Choose ${choice.count} valid ${choice.count === 1 ? 'ability' : 'abilities'} for this race benefit.`,
        ),
      )
    }
  }

  const backgroundBlock =
    calculation.abilityScores.backgroundAbilityData.blocks[character.backgroundAsiBlockIndex ?? 0]
  if (backgroundBlock) {
    const selected = (character.backgroundAsiChoices ?? [])
      .map(normalizeAbilityName)
      .filter((ability): ability is AbilityName => ability !== null)
      .filter((ability, selectedIndex, all) => all.indexOf(ability) === selectedIndex)
    const valid = selected.filter((ability) => backgroundBlock.from.includes(ability))
    if (valid.length < backgroundBlock.weights.length) {
      issues.push(
        readinessIssue(
          'background:ability-choices',
          'blocking',
          'ability-scores',
          'Finish background ability choices',
          `Choose ${backgroundBlock.weights.length} different abilities from the selected background method.`,
        ),
      )
    }
  }
  return issues
}
