import {
  getClassChoiceSlotLevels,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import {
  isRevisedTargetedInvocation,
  REVISED_INVOCATION_POOL,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { getSpellNameKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
} from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { getClassChoiceCatalogOptionKey, getClassChoiceOptionKey } from './classChoiceIdentity'

export function getSavedRevisedInvocationOwner(
  character: Character,
  selection: CharacterClassChoiceSelection,
) {
  if (
    selection.choiceId !== REVISED_INVOCATION_POOL ||
    selection.kind !== 'optional-feature' ||
    selection.classLevel !== 1 ||
    norm(selection.className) !== 'warlock' ||
    norm(selection.classSource) !== 'xphb' ||
    selection.subclassName ||
    selection.subclassSource ||
    character.classChoiceSelections?.filter((row) => row.choiceId === selection.choiceId).length !==
      1
  )
    return undefined
  const owners = character.classProgression.filter(
    (row) => norm(row.name) === 'warlock' && norm(row.source) === 'xphb',
  )
  const owner = owners.length === 1 ? owners[0] : undefined
  if (
    !owner ||
    !selection.selected.length ||
    selection.selected.some(
      (row) =>
        row.entityType !== 'optionalFeature' ||
        !row.name.trim() ||
        !row.source?.trim() ||
        row.ref ||
        !Number.isInteger(row.slotLevel) ||
        row.slotLevel < 1 ||
        row.slotLevel > owner.levels,
    )
  )
    return undefined
  return owner
}

export function getInvocationRepeatKey(option: NormalizedChoiceOptionReference) {
  return option.invocationCantrip
    ? JSON.stringify([
        getClassChoiceCatalogOptionKey(option),
        getSpellNameKey(option.invocationCantrip.name),
      ])
    : undefined
}

export function hasEarnedRevisedInvocationSlots(
  choice: NormalizedCharacterChoice,
  selected: readonly CharacterClassChoiceOption[],
  classLevel: number,
) {
  if (new Set(selected.map(getClassChoiceOptionKey)).size !== selected.length) return false
  const available = getClassChoiceSlotLevels(choice).slice(
    0,
    getRequiredChoiceSelectionCount(choice, classLevel),
  )
  return selected.every((row) => {
    const index = available.indexOf(row.slotLevel)
    if (index === -1) return false
    available.splice(index, 1)
    return true
  })
}

/** An edited target inherits the removed occurrence's gain before using an empty slot. */
export function getRevisedInvocationSlotPrior(
  previous: readonly CharacterClassChoiceOption[],
  selected: readonly NormalizedChoiceOptionReference[],
) {
  const prior = previous.map((row) => ({
    key: getClassChoiceOptionKey(row),
    slotLevel: row.slotLevel,
  }))
  const selectedKeys = new Set(selected.map(getClassChoiceOptionKey))
  const previousKeys = new Set(prior.map((row) => row.key))
  for (const option of selected) {
    const key = getClassChoiceOptionKey(option)
    if (!option.invocationCantrip || previousKeys.has(key)) continue
    const index = previous.findIndex(
      (row, index) =>
        isRevisedTargetedInvocation(row) &&
        !selectedKeys.has(prior[index].key) &&
        getClassChoiceCatalogOptionKey(row) === getClassChoiceCatalogOptionKey(option),
    )
    if (index !== -1) prior[index].key = key
  }
  return prior
}
