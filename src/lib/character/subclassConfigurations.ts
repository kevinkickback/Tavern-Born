import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { FeatureOptionSelectionState } from '@/lib/character/featureOptionSelections'
import { getInvalidFeatureOptionSelectionPaths } from '@/lib/schema/featureOptionValidation'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { NormalizedCharacterChoice } from '@/types/classRules'

/** Stable initial setup belongs to the selected subclass's granting feature. */
export function getSubclassConfigurations(
  choices: readonly NormalizedCharacterChoice[],
  classData: Class5e | undefined,
  subclass: Subclass5e | undefined,
): NormalizedCharacterChoice[] {
  if (
    !classData ||
    !subclass ||
    !classData.classFeatureRefs?.some((ref) => ref.gainSubclassFeature)
  )
    return []
  const { subclassLevel } = getSubclassSelectionInfo(classData)
  if (!subclassLevel || subclassLevel > 20) return []
  const owner = getFeatureOwnerKey(classData.name, classData.source, subclass.name, subclass.source)
  return choices.filter((choice) => {
    const count = choice.minimumSelections
    return (
      choice.owner.type === 'subclass' &&
      getFeatureOwnerKey(
        choice.owner.name,
        choice.owner.source,
        choice.owner.subclassName,
        choice.owner.subclassSource,
      ) === owner &&
      choice.level === subclassLevel &&
      choice.replacement.cadence === 'never' &&
      !choice.repeatable &&
      Number.isInteger(count) &&
      count > 0 &&
      choice.maximumSelections === count &&
      choice.selectionCountByLevel.length === 20 &&
      Array.from(choice.selectionCountByLevel.slice(choice.level - 1)).every(
        (value) => value === count,
      )
    )
  })
}

/** Recovery changes the parent's status without reintroducing unavailable configuration controls. */
export function hasUnavailableSubclassConfiguration(
  states: readonly FeatureOptionSelectionState[],
  classData: Class5e | undefined,
  subclass: Subclass5e | undefined,
): boolean {
  if (
    !classData ||
    !subclass ||
    !classData.classFeatureRefs?.some((ref) => ref.gainSubclassFeature)
  )
    return false
  const { subclassLevel } = getSubclassSelectionInfo(classData)
  const owner = getFeatureOwnerKey(classData.name, classData.source, subclass.name, subclass.source)
  return states.some(
    ({ recovery, selection, choice }) =>
      recovery &&
      selection.classLevel === subclassLevel &&
      getFeatureOwnerKey(
        selection.className,
        selection.classSource,
        selection.subclassName,
        selection.subclassSource,
      ) === owner &&
      (choice
        ? getSubclassConfigurations([choice], classData, subclass).length > 0
        : selection.kind === 'feature-option' &&
          !isFeatureLiteralChoiceId(selection.choiceId) &&
          getInvalidFeatureOptionSelectionPaths({ classChoiceSelections: [selection] }).length ===
            0),
  )
}
