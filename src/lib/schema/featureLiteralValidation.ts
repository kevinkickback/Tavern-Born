import {
  getBarbarianPathChoice,
  getSavedBarbarianPathOption,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import { decodeFavoredEnemyChoiceId } from '@/lib/5etools/favoredEnemyIdentity'
import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import {
  getSavedAffinityDamageType,
  isRevisedAffinityOption,
  REVISED_AFFINITY_ID,
} from '@/lib/5etools/revisedElementalAffinity'
import {
  getRevisedHunterRule,
  isValidRevisedHunterSelection,
} from '@/lib/5etools/revisedHunterIdentity'
import {
  getSubclassFeatureConfigurationRule,
  isValidSubclassFeatureConfigurationSelection,
} from '@/lib/5etools/subclassFeatureConfiguration'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import { getInvalidFavoredEnemySelectionIds } from './favoredEnemyValidation'
import { getInvalidNaturalExplorerSelectionIds } from './naturalExplorerValidation'

/** Reserved source-group identities must belong to a recognized family; no permissive fallback. */
export function getInvalidFeatureLiteralSelectionIds(
  rows: readonly CharacterClassChoiceSelection[],
  progression?: Character['classProgression'],
) {
  const invalid = new Set([
    ...getInvalidNaturalExplorerSelectionIds(
      rows.filter((s) => !!decodeNaturalExplorerChoiceId(s.choiceId)),
    ),
    ...getInvalidFavoredEnemySelectionIds(rows),
  ])
  const seen = new Set<string>()
  for (const s of rows) {
    if (getBarbarianPathChoice(s.choiceId)) {
      if (seen.has(s.choiceId) || !getSavedBarbarianPathOption(s)) invalid.add(s.choiceId)
      seen.add(s.choiceId)
      continue
    }
    if (s.choiceId === REVISED_AFFINITY_ID || s.selected.some(isRevisedAffinityOption)) {
      if (seen.has(s.choiceId) || !getSavedAffinityDamageType(s, progression))
        invalid.add(s.choiceId)
      seen.add(s.choiceId)
      continue
    }
    const configuration = getSubclassFeatureConfigurationRule(s.choiceId)
    if (configuration || getRevisedHunterRule(s.choiceId)) {
      if (
        seen.has(s.choiceId) ||
        !(configuration
          ? isValidSubclassFeatureConfigurationSelection(s)
          : isValidRevisedHunterSelection(s))
      )
        invalid.add(s.choiceId)
      seen.add(s.choiceId)
      continue
    }
    if (
      (isFeatureLiteralChoiceId(s.choiceId) ||
        s.selected.some((o) => decodeFeatureOptionReference(o)?.format === 'source-group')) &&
      !decodeNaturalExplorerChoiceId(s.choiceId) &&
      !decodeFavoredEnemyChoiceId(s.choiceId)
    )
      invalid.add(s.choiceId)
  }
  return invalid
}
