import { createEmptyCharacter, emptyProvenance } from '@/lib/character/createCharacter'
import type { Background5e, Class5e, Item5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { applyBackgroundSelectionCommand } from './backgroundCommands'
import { applyClassSelectionCommand } from './classCommands'
import { applyRaceSelectionCommand, type ResolveRaceChoiceOptions } from './raceCommands'

export interface InitialCharacterSelections {
  initial: Partial<Character>
  race?: Race5e
  subrace?: Race5e
  classEntity?: Class5e
  background?: Background5e
  raceAsiBlockIndex?: 0 | 1
  raceAsiChoices?: string[][]
  classEquipmentChoices?: string[]
  backgroundEquipmentChoices?: string[]
}

function applyPatch(character: Character, patch: Partial<Character>): Character {
  return { ...character, ...patch }
}

export function buildInitialCharacter(
  selections: InitialCharacterSelections,
  itemLookup: Map<string, Item5e>,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
): Character {
  let character = createEmptyCharacter(selections.initial)
  let ledger = character.provenance ?? emptyProvenance()

  if (selections.race) {
    const result = applyRaceSelectionCommand(
      character,
      ledger,
      selections.race,
      selections.subrace,
      selections.raceAsiBlockIndex ?? 0,
      resolveRaceChoiceOptions,
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  if (selections.classEntity) {
    const classKey = `${selections.classEntity.name}|${selections.classEntity.source ?? ''}`
    character = applyPatch(character, {
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classKey]: selections.classEquipmentChoices ?? [],
      },
    })
    const result = applyClassSelectionCommand(
      character,
      ledger,
      selections.classEntity,
      undefined,
      itemLookup,
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  if (selections.background) {
    const result = applyBackgroundSelectionCommand(
      character,
      ledger,
      selections.background,
      selections.backgroundEquipmentChoices ?? [],
      itemLookup,
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  return {
    ...character,
    provenance: ledger,
    raceAsiChoices: selections.raceAsiChoices ?? character.raceAsiChoices,
  }
}
