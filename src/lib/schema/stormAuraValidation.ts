import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import {
  getStormAuraChoiceId,
  isStormAuraChoiceId,
  STORM_ENVIRONMENTS,
  stormTarget,
} from '@/lib/5etools/stormAuraIdentity'
import type { CharacterClassChoiceSelection } from '@/types/character'

/** New namespace validates without live catalogs, preserving valid intent during source loss. */
export function isValidStormAuraSelection(selection: CharacterClassChoiceSelection): boolean {
  const norm = (value: string | undefined) => value?.trim().toLowerCase()
  if (
    !isStormAuraChoiceId(selection.choiceId) ||
    selection.kind !== 'subclass-feature' ||
    norm(selection.className) !== 'barbarian' ||
    !['phb', 'xphb'].includes(norm(selection.classSource) ?? '') ||
    norm(selection.subclassName) !== 'path of the storm herald' ||
    norm(selection.subclassSource) !== 'xge' ||
    selection.selected.length !== 1 ||
    selection.classLevel < 3 ||
    selection.choiceId !==
      getStormAuraChoiceId(
        {
          name: selection.className,
          source: selection.classSource,
          subclassName: selection.subclassName,
          subclassSource: selection.subclassSource,
        },
        selection.classLevel,
      )
  )
    return false
  const option = selection.selected[0]
  if (
    option.entityType !== 'subclassFeature' ||
    !option.ref ||
    ![6, 7].includes(option.ref.split('|').length) ||
    option.slotLevel !== selection.classLevel ||
    (!!option.source?.trim() && norm(option.source) !== 'xge')
  )
    return false
  const name = STORM_ENVIRONMENTS.find((value) => norm(value) === norm(option.name))
  return (
    !!name &&
    getSubclassFeatureIdentity(decodeSubclassFeatureReference(option.ref)) === stormTarget(name, 3)
  )
}
