import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { decodeLegacySubclassChoice } from '@/lib/5etools/legacySubclassChoiceIdentity'
import {
  isValidKenseiSelection,
  isValidLegacyStyleSelection,
} from '@/lib/schema/legacySubclassChoiceValidation'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

/** Shared saved-choice recovery/details/PDF path, including explicit source-free removal. */
export function getLegacySubclassSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return (character.classChoiceSelections ?? [])
    .filter((row) => decodeLegacySubclassChoice(row.choiceId))
    .map((selection) => {
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner && findClassReference(owner, classes),
        subclass = classData && owner ? getSelectedSubclassData(classData, owner) : undefined
      const valid = isValidKenseiSelection(selection) || isValidLegacyStyleSelection(selection)
      const choice =
        owner && classData && valid
          ? getClassChoiceCandidates(classData, subclass, catalogs).find(
              (c) => c.id === selection.choiceId && c.level <= owner.levels && activity.choice(c),
            )
          : undefined
      const options =
        choice && owner
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
      const details = selection.selected.map((reference) => {
        const option = options.find(
          (v) => getClassChoiceOptionKey(v.reference) === getClassChoiceOptionKey(reference),
        )
        return {
          name: reference.name,
          entries: option?.entries ?? [],
          available: option?.availability === 'eligible',
        }
      })
      return {
        selection,
        owner,
        classData,
        subclass,
        choice,
        options,
        details,
        recovery: !choice || details.some((v) => !v.available),
        legacySubclass: true,
      }
    })
}
