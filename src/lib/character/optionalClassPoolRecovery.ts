import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { getRegisteredOptionalPoolSelection } from './optionalClassPoolSelections'

/** Missing current authority exposes exact saved membership for removal, never a synthetic choice. */
export function getOptionalClassPoolSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return (character.classChoiceSelections ?? []).flatMap((selection) => {
    const registered = getRegisteredOptionalPoolSelection(character, selection)
    if (!registered) return []
    const { owner } = registered
    const classData = findClassReference(owner, classes)
    const subclass = classData ? getSelectedSubclassData(classData, owner) : undefined
    const choice = classData
      ? getCharacterClassChoices(classData, subclass, activity, catalogs).find(
          (row) =>
            row.id === selection.choiceId &&
            row.kind === 'optional-feature' &&
            row.level === selection.classLevel,
        )
      : undefined
    const options = choice
      ? resolveClassChoiceOptions(
          choice,
          createClassChoiceCatalogs(catalogs),
          selection.selected,
          owner.levels,
          character,
        )
      : selection.selected.map((reference) => ({
          reference,
          availability: 'retained' as const,
          entries: [],
        }))
    const recovery = !choice || !options.some(isClassChoiceOptionEligible)
    if (!recovery) return []
    return [
      {
        selection,
        owner,
        classData,
        subclass,
        choice,
        options,
        recovery,
        optionalPool: true,
        details: selection.selected.map((selected) => {
          const option = options.find(
            (row) => getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(selected),
          )
          return {
            name: selected.name,
            available: !!option && isClassChoiceOptionEligible(option),
            entries: option?.entries ?? [],
          }
        }),
      },
    ]
  })
}
