import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import {
  decodeNaturalExplorerChoiceId,
  FAVORED_TERRAIN_GROUP,
  FAVORED_TERRAINS,
  getNaturalExplorerChoiceId,
  NATURAL_EXPLORER_TARGET,
} from '@/lib/5etools/naturalExplorerIdentity'
import type { CharacterClassChoiceSelection } from '@/types/character'

/** Offline admission validates intent without trusting current data or a persisted inactive hint. */
function isValidNaturalExplorerSelection(selection: CharacterClassChoiceSelection): boolean {
  const relation = decodeNaturalExplorerChoiceId(selection.choiceId)
  if (
    !relation ||
    selection.kind !== 'feature-option' ||
    selection.selected.length !== 1 ||
    !selection.className.trim() ||
    !selection.classSource.trim() ||
    selection.subclassName ||
    selection.subclassSource ||
    relation.level !== selection.classLevel ||
    selection.choiceId !==
      getNaturalExplorerChoiceId(
        { name: selection.className, source: selection.classSource },
        relation.grant,
        selection.classLevel,
      )
  )
    return false
  const option = selection.selected[0]
  const target =
    option.entityType === 'featureOption' ? decodeFeatureOptionReference(option) : undefined
  return (
    target?.format === 'source-group' &&
    target.kind === 'classFeature' &&
    target.parentIdentity === NATURAL_EXPLORER_TARGET &&
    target.group === FAVORED_TERRAIN_GROUP &&
    option.slotLevel === selection.classLevel &&
    FAVORED_TERRAINS.some((name) => name.toLowerCase() === target.literal)
  )
}
export function getInvalidNaturalExplorerSelectionIds(
  selections: readonly CharacterClassChoiceSelection[],
): Set<string> {
  const invalid = new Set<string>(),
    ids = new Map<string, string>(),
    grants = new Map<string, string>(),
    literals = new Map<string, string>()
  for (const selection of selections) {
    const hasGroup = selection.selected.some(
      (option) => decodeFeatureOptionReference(option)?.format === 'source-group',
    )
    if (!isFeatureLiteralChoiceId(selection.choiceId) && !hasGroup) continue
    if (!isValidNaturalExplorerSelection(selection)) {
      invalid.add(selection.choiceId)
      continue
    }
    const relation = decodeNaturalExplorerChoiceId(selection.choiceId)!
    const option = decodeFeatureOptionReference(selection.selected[0])!
    if (option.format !== 'source-group') continue
    const family = JSON.stringify([relation.owner, relation.pool, relation.group])
    for (const [map, key] of [
      [ids, selection.choiceId],
      [grants, JSON.stringify([family, relation.grant])],
      [literals, JSON.stringify([family, option.literal])],
    ] as const) {
      const prior = map.get(key)
      if (prior) {
        invalid.add(prior)
        invalid.add(selection.choiceId)
      }
      map.set(key, selection.choiceId)
    }
  }
  return invalid
}
