import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { getPsionicEntries } from '@/lib/5etools/psionicEntries'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'
import { getMysticDisciplineState } from './mysticDisciplineReplacement'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

/** Recover saved exact intent without borrowing unfiltered rules or another earned allocation. */
export function getPsionicRecoveryStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): FeatureOptionSelectionState[] {
  const disciplineSlots = character.mysticDisciplineReplacements?.length
    ? getMysticDisciplineState(character, catalogs).slots
    : []
  return (character.classChoiceSelections ?? [])
    .filter((row) => row.kind === 'psionic')
    .map((selection) => {
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner && findClassReference(owner, classes)
      const subclass = classData && owner ? getSelectedSubclassData(classData, owner) : undefined
      const choice =
        classData && owner
          ? getCharacterClassChoices(
              classData,
              subclass,
              createOptionalClassFeatureActivity(character, catalogs),
              catalogs,
            ).find((row) => row.id === selection.choiceId)
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
      const details = selection.selected.map((row) => {
        const slot = disciplineSlots.find(
          (slot) => slot.selection === selection && slot.original === row,
        )
        if (slot)
          return {
            name: slot.current.name,
            source: slot.current.source,
            available: !!slot.printing,
            entries: slot.printing
              ? getPsionicEntries(slot.printing)
              : ['Restore the exact discipline source or remove this allocation.'],
          }
        const view = options.find(
          (view) => getClassChoiceOptionKey(view.reference) === getClassChoiceOptionKey(row),
        )
        const available = !!view && view.availability === 'eligible'
        return {
          name: row.name,
          available,
          entries: available
            ? view.entries
            : [
                'Current psionic setup rules are unavailable or this earned allocation no longer qualifies. Restore the exact source, or clear this saved choice before correcting setup.',
              ],
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
        recovery: !choice || details.some((row) => !row.available),
        psionic: true,
      }
    })
    .filter((state) => state.recovery)
}
