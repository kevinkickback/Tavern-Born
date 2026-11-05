import { BLESSED_STRIKES_ID, getSavedBlessedStrikes } from '@/lib/5etools/blessedStrikesSource'
import { getLandChoiceRule } from '@/lib/5etools/circleOfTheLand'
import { ELEMENTAL_FURY_ID, getSavedElementalFury } from '@/lib/5etools/elementalFurySource'
import {
  decodeFeatureOptionReference,
  getFeatureOptionChoiceId,
  getFeatureOptionKey,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'
import { getInvalidFeatureLiteralSelectionIds } from './featureLiteralValidation'

/** New literal relations validate structurally even while their rules are unavailable. */
export function getInvalidFeatureOptionSelectionPaths(
  character: Pick<Character, 'classChoiceSelections'> &
    Partial<Pick<Character, 'classProgression'>>,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const invalidGroups = getInvalidFeatureLiteralSelectionIds(character.classChoiceSelections ?? [])
  const blessedStrikes = getSavedBlessedStrikes(character.classChoiceSelections ?? [])
  const elementalFury = getSavedElementalFury(character.classChoiceSelections ?? [])
  for (const [index, selection] of (character.classChoiceSelections ?? []).entries()) {
    if (
      (selection.choiceId === BLESSED_STRIKES_ID && selection !== blessedStrikes) ||
      (selection.choiceId === ELEMENTAL_FURY_ID && selection !== elementalFury)
    ) {
      paths.push(['classChoiceSelections', index])
      continue
    }
    const land = getLandChoiceRule(selection.choiceId)
    if (land && character.classProgression) {
      const owners = character.classProgression.filter(
        (entry) =>
          norm(entry.name) === norm(land.owner.name) &&
          norm(entry.source) === norm(land.owner.source) &&
          norm(entry.subclass) === norm(land.owner.subclassName) &&
          norm(entry.subclassSource) === norm(land.owner.subclassSource),
      )
      if (owners.length !== 1 || owners[0].levels < land.level) {
        paths.push(['classChoiceSelections', index])
        continue
      }
    }
    if (
      selection.favoredEnemy !== undefined ||
      isFeatureLiteralChoiceId(selection.choiceId) ||
      selection.selected.some(
        (option) => decodeFeatureOptionReference(option)?.format === 'source-group',
      )
    ) {
      if (invalidGroups.has(selection.choiceId)) paths.push(['classChoiceSelections', index])
      continue
    }
    const literal = selection.kind === 'feature-option'
    if (!literal && !selection.selected.some((option) => option.entityType === 'featureOption'))
      continue
    const root = ['classChoiceSelections', index]
    if (
      !literal ||
      selection.selected.length === 0 ||
      !selection.className.trim() ||
      !selection.classSource.trim() ||
      Boolean(selection.subclassName?.trim()) !== Boolean(selection.subclassSource?.trim())
    ) {
      paths.push(root)
      continue
    }
    const seen = new Set<string>()
    for (const [row, option] of selection.selected.entries()) {
      const target =
        option.entityType === 'featureOption' ? decodeFeatureOptionReference(option) : undefined
      const key = getFeatureOptionKey(option)
      if (
        !target ||
        target.format === 'source-group' ||
        !key ||
        seen.has(key) ||
        option.slotLevel < selection.classLevel ||
        selection.choiceId !==
          getFeatureOptionChoiceId(
            {
              name: selection.className,
              source: selection.classSource,
              subclassName: selection.subclassName,
              subclassSource: selection.subclassSource,
            },
            target.parentIdentity,
            target.table,
            selection.classLevel,
          )
      )
        paths.push([...root, 'selected', row])
      if (key) seen.add(key)
    }
  }
  return paths
}
