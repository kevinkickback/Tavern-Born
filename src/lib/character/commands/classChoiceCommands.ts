import {
  getRequiredChoiceSelectionCount,
  type NormalizedCharacterChoice,
  type NormalizedChoiceOptionReference,
} from '@/lib/5etools/classChoiceNormalization'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
} from '@/types/character'

function optionKey(option: NormalizedChoiceOptionReference): string {
  return `${option.entityType}|${option.name.trim().toLowerCase()}|${option.source?.trim().toLowerCase() ?? ''}`
}

function getChoiceSlotLevels(choice: NormalizedCharacterChoice): number[] {
  const levels: number[] = []
  let previousCount = 0
  choice.selectionCountByLevel.forEach((count, index) => {
    const gain = Math.max(0, count - previousCount)
    for (let slot = 0; slot < gain; slot += 1) levels.push(index + 1)
    previousCount = count
  })
  return levels
}

function findOwnerLevel(character: Character, choice: NormalizedCharacterChoice): number {
  return (
    character.classProgression?.find(
      (entry) =>
        entry.name === choice.owner.name && (entry.source ?? '') === (choice.owner.source ?? ''),
    )?.levels ?? 0
  )
}

function validateSelectedOptions(
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
): void {
  const keys = selected.map(optionKey)
  if (!choice.repeatable && new Set(keys).size !== keys.length) {
    throw new RangeError(`${choice.label} does not allow duplicate selections.`)
  }
  if (choice.options.length === 0) return
  const allowed = new Set(choice.options.map(optionKey))
  if (keys.some((key) => !allowed.has(key))) {
    throw new RangeError(`A selected option is not available for ${choice.label}.`)
  }
}

/** Persists a complete or partial source-qualified class choice without applying future effects. */
export function applyClassChoiceSelectionCommand(
  character: Character,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
): Pick<Character, 'classChoiceSelections'> {
  const classLevel = findOwnerLevel(character, choice)
  if (classLevel < choice.level) {
    throw new RangeError(`${choice.label} is not available at the character's current class level.`)
  }
  const requiredCount = getRequiredChoiceSelectionCount(choice, classLevel)
  if (selected.length > requiredCount) {
    throw new RangeError(`${choice.label} allows ${requiredCount} selections at this class level.`)
  }
  validateSelectedOptions(choice, selected)

  const slotLevels = getChoiceSlotLevels(choice)
  const selection: CharacterClassChoiceSelection = {
    choiceId: choice.id,
    label: choice.label,
    kind: choice.kind,
    className: choice.owner.name,
    classSource: choice.owner.source,
    classLevel: choice.level,
    selected: selected.map<CharacterClassChoiceOption>((option, index) => ({
      ...option,
      name: option.name.trim(),
      ...(option.source?.trim() ? { source: option.source.trim() } : {}),
      slotLevel: slotLevels[index] ?? choice.level,
    })),
  }
  const retained = (character.classChoiceSelections ?? []).filter(
    (existing) => existing.choiceId !== choice.id,
  )
  return {
    classChoiceSelections: selection.selected.length > 0 ? [...retained, selection] : retained,
  }
}

/** Removes selections whose source-qualified class or earned choice slot no longer exists. */
export function reconcileClassChoiceSelections(
  selections: readonly CharacterClassChoiceSelection[] | undefined,
  progression: readonly CharacterClassEntry[],
): CharacterClassChoiceSelection[] {
  return (selections ?? []).flatMap((selection) => {
    const owner = progression.find(
      (entry) =>
        entry.name === selection.className &&
        (entry.source ?? '') === (selection.classSource ?? ''),
    )
    if (!owner || owner.levels < selection.classLevel) return []
    const selected = selection.selected.filter((option) => option.slotLevel <= owner.levels)
    return selected.length > 0 ? [{ ...selection, selected }] : []
  })
}
