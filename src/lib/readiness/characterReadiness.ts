import type { Character } from '@/types/character'
import { validateClassChoices } from './classReadiness'
import {
  validateBaseScores,
  validateEquipment,
  validateFeatSetup,
  validateIdentity,
  validateProvenanceChoices,
} from './coreReadiness'
import { validateOriginAbilityChoices } from './originReadiness'
import { readinessIssue } from './readinessIssue'
import { validateSourceReferences } from './sourceReadiness'
import { validateSpells } from './spellReadiness'
import type {
  CharacterReadinessContext,
  CharacterReadinessIssue,
  CharacterReadinessResult,
} from './types'

export type {
  CharacterReadinessContext,
  CharacterReadinessResult,
} from './types'

export function getCharacterReadiness(
  character: Character,
  context: CharacterReadinessContext = {},
): CharacterReadinessResult {
  const issues: CharacterReadinessIssue[] = [
    ...validateIdentity(character),
    ...validateBaseScores(character),
    ...validateProvenanceChoices(character),
  ]
  const calculation = context.calculation
  if (calculation) {
    issues.push(
      ...validateSourceReferences(character, calculation),
      ...validateOriginAbilityChoices(character, calculation),
      ...validateClassChoices(character, calculation, context.classChoiceCatalogs),
      ...validateSpells(character, calculation, context.spellsByKey),
    )
  }
  issues.push(...validateFeatSetup(character, context.featsByKey), ...validateEquipment(character))

  if (!character.portrait) {
    issues.push(
      readinessIssue(
        'portrait:missing',
        'recommendation',
        'portrait',
        'Add a portrait',
        'A portrait is optional, but helps identify the character in the library.',
      ),
    )
  }

  const deduplicated = [...new Map(issues.map((entry) => [entry.id, entry])).values()]
  const blockingIssues = deduplicated.filter((entry) => entry.severity === 'blocking')
  const recommendations = deduplicated.filter((entry) => entry.severity === 'recommendation')
  return {
    status: blockingIssues.length > 0 ? 'incomplete' : 'ready',
    issues: deduplicated,
    blockingIssues,
    recommendations,
  }
}
