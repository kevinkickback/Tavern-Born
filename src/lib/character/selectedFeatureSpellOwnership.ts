import {
  getClassOrderById,
  getClassOrderOption,
  getSavedClassOrder,
} from '@/lib/5etools/classOrderIdentity'
import {
  declaredSubclassSlots,
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
  if (option.entityType === 'classFeature') {
    const order = getClassOrderById(selection.choiceId)
    if (
      !order ||
      selection.selected[0] !== option ||
      getClassOrderOption(selection, order) !== 'caster'
    )
      return undefined
    return selectedFeatureSpellAddress([
      selection.choiceId,
      'classFeature',
      norm(order.caster.name),
      'xphb',
      order.caster.target,
      0,
      0,
    ])
  }
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
function hasDeclaredSubclassOwner(character: Character, slot: ManagedClassSpellSlot) {
  const [owner, , , level] = slot
  const entries = character.classProgression.filter(
    (entry) =>
      norm(entry.name) === owner[1] &&
      norm(entry.source) === owner[2] &&
      norm(entry.subclass) === owner[3] &&
      norm(entry.subclassSource) === owner[4],
  )
  return entries.length === 1 && entries[0].levels >= level
}

export function hasSavedSelectedFeatureSpellOwner(
  character: Character,
  slot: ManagedClassSpellSlot,
) {
  const address = decodeSelectedFeatureSpellAddress(slot[2])
  if (!address) return false
  if (address[1] === 'subclassFeature')
    return declaredSubclassSlots.some(
      (row) =>
        JSON.stringify(row) === JSON.stringify(slot) && hasDeclaredSubclassOwner(character, row),
    )
  if (address[1] === 'classFeature') {
    const order = getClassOrderById(address[0])
    if (!order || getSavedClassOrder(character, order)?.branch !== 'caster') return false
  }
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
  const producers = new Set(
    (character.classChoiceSelections ?? []).flatMap((selection) =>
      selection.selected.flatMap((option) => {
        const producer = getSelectedFeatureSpellProducer(selection, option)
        return producer
          ? [JSON.stringify([selectedFeatureSpellOwner(selection), producer, option.slotLevel])]
          : []
      }),
    ),
  )
  for (const slot of declaredSubclassSlots) {
    if (!hasDeclaredSubclassOwner(character, slot)) continue
    const [owner, , producer, level] = slot
    producers.add(JSON.stringify([owner, producer, level]))
  }
  return producers
}
