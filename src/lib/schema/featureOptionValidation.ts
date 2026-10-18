import {
  decodeFeatureOptionReference,
  getFeatureOptionChoiceId,
  getFeatureOptionKey,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import type { Character } from '@/types/character'
import { getInvalidNaturalExplorerSelectionIds } from './naturalExplorerValidation'

/** New literal relations validate structurally even while their rules are unavailable. */
export function getInvalidFeatureOptionSelectionPaths(
  character: Pick<Character, 'classChoiceSelections'>,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const invalidGroups = getInvalidNaturalExplorerSelectionIds(character.classChoiceSelections ?? [])
  for (const [index, selection] of (character.classChoiceSelections ?? []).entries()) {
    if (
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
