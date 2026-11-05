import { getLandChoiceRule, isValidLandSelection } from '@/lib/5etools/circleOfTheLand'
import { decodeFavoredEnemyChoiceId } from '@/lib/5etools/favoredEnemyIdentity'
import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import {
  getRevisedHunterRule,
  isValidRevisedHunterSelection,
} from '@/lib/5etools/revisedHunterIdentity'
import type { CharacterClassChoiceSelection } from '@/types/character'
import { getInvalidFavoredEnemySelectionIds } from './favoredEnemyValidation'
import { getInvalidNaturalExplorerSelectionIds } from './naturalExplorerValidation'

/** Reserved source-group identities must belong to a recognized family; no permissive fallback. */
export function getInvalidFeatureLiteralSelectionIds(
  rows: readonly CharacterClassChoiceSelection[],
) {
  const invalid = new Set([
    ...getInvalidNaturalExplorerSelectionIds(
      rows.filter((s) => !!decodeNaturalExplorerChoiceId(s.choiceId)),
    ),
    ...getInvalidFavoredEnemySelectionIds(rows),
  ])
  const seen = new Set<string>()
  for (const s of rows) {
    const land = getLandChoiceRule(s.choiceId)
    if (land || getRevisedHunterRule(s.choiceId)) {
      if (
        seen.has(s.choiceId) ||
        !(land ? isValidLandSelection(s) : isValidRevisedHunterSelection(s))
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
