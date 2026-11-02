import {
  decodeSelectedFeatureSpellAddress,
  selectedFeatureSpellAddress,
} from '@/lib/5etools/selectedFeatureSpellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
} from '@/types/character'
import type { ClassSpellOwner, ManagedClassSpellSlot } from '@/types/classCasting'

export const selectedFeatureSpellOwner = (
  selection: CharacterClassChoiceSelection,
): ClassSpellOwner =>
  selection.subclassName
    ? [
        'subclass',
        norm(selection.className),
        norm(selection.classSource),
        norm(selection.subclassName),
        norm(selection.subclassSource),
      ]
    : ['class', norm(selection.className), norm(selection.classSource)]

export function getSelectedFeatureSpellProducer(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
) {
  if (
    !['optionalFeature', 'feat'].includes(option.entityType) ||
    !option.source?.trim() ||
    option.ref !== undefined
  )
    return undefined
  return selectedFeatureSpellAddress([
    selection.choiceId,
    option.entityType as 'optionalFeature' | 'feat',
    norm(option.name),
    norm(option.source),
    option.ref ?? null,
    0,
    0,
  ])
}

/** Saved ownership only; missing source data or suspended permission does not remove intent. */
export function hasSavedSelectedFeatureSpellOwner(
  character: Character,
  slot: ManagedClassSpellSlot,
) {
  const address = decodeSelectedFeatureSpellAddress(slot[2])
  if (!address) return false
  const matches = (character.classChoiceSelections ?? []).filter(
    (selection) =>
      JSON.stringify(selectedFeatureSpellOwner(selection)) === JSON.stringify(slot[0]) &&
      selection.choiceId === address[0] &&
      selection.selected.filter(
        (option) =>
          option.slotLevel === slot[3] &&
          getSelectedFeatureSpellProducer(selection, option) === slot[2],
      ).length === 1,
  )
  return matches.length === 1
}

export function getSavedSelectedFeatureSpellProducers(character: Character) {
  return new Set(
    (character.classChoiceSelections ?? []).flatMap((selection) =>
      selection.selected.flatMap((option) => {
        const producer = getSelectedFeatureSpellProducer(selection, option)
        return producer
          ? [JSON.stringify([selectedFeatureSpellOwner(selection), producer, option.slotLevel])]
          : []
      }),
    ),
  )
}
