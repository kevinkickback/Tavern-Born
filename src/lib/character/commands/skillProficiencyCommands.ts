import {
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceOptions'
import type { ExpertiseAuthority } from '@/lib/character/skillExpertiseChoices'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import { normalizeKey } from '@/lib/provenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from './classChoiceCommands'
import type { CharacterCommandResult } from './commandResult'
import { resolveProficiencyChoiceCommand } from './featCommands'

/** Exact latest saved removal needs no source authority and cannot replay other saved grants. */
export function removeSavedSkillProficiencyCommand(
  character: Character,
  ledger: ProvenanceLedger,
  skill: string,
  actionId: string,
): CharacterCommandResult {
  const name = normalizeKey(skill)
  if (actionId.startsWith('class:remove:')) {
    const id = actionId.slice('class:remove:'.length)
    const selection = character.classChoiceSelections?.find((row) => row.choiceId === id)
    if (
      decodeClassProficiencyChoiceId(id)?.domain === 'skills' &&
      selection?.selected.some((pick) => decodeProficiencyOption(pick)?.name === name)
    )
      return retainSavedFeatureOptionsCommand(
        character,
        ledger,
        id,
        selection.selected
          .filter((pick) => decodeProficiencyOption(pick)?.name !== name)
          .map(getClassChoiceOptionKey),
      )
  } else if (actionId.startsWith('ledger:remove:')) {
    const id = actionId.slice('ledger:remove:'.length)
    const choice = ledger.choices.find((row) => row.id === id && row.domain === 'skills')
    if (choice?.selected.some((pick) => normalizeKey(pick) === name))
      return resolveProficiencyChoiceCommand(character, ledger, 'skills', name, false, id)
  }
  return { characterPatch: {}, provenanceUpdate: ledger }
}

/** Reconstruct permissible actions from the latest character/ledger at confirmation. */
export function applySkillProficiencyActionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  skill: string,
  actionId: string,
  authority: ExpertiseAuthority,
): CharacterCommandResult {
  const model = getSkillProficiencyChoices(character, authority, ledger)
  const name = normalizeKey(skill)
  const action = model.actions[name]?.find((row) => row.id === actionId)
  if (!action) return { characterPatch: {}, provenanceUpdate: ledger }
  if (action.kind === 'ledger')
    return resolveProficiencyChoiceCommand(
      character,
      ledger,
      'skills',
      name,
      action.adding,
      action.ownerId,
      authority.catalogs,
    )
  const owner = model.classOwners.find((row) => row.id === action.ownerId)!
  const selected = owner.selection?.selected ?? []
  if (!action.adding)
    return retainSavedFeatureOptionsCommand(
      character,
      ledger,
      owner.id,
      selected
        .filter((pick) => decodeProficiencyOption(pick)?.name !== name)
        .map(getClassChoiceOptionKey),
      authority,
    )
  const pick = owner.options.find(
    (option) =>
      option.availability === 'eligible' &&
      decodeProficiencyOption(option.reference)?.name === name,
  )!
  return applyClassChoiceSelectionWithGrantsCommand(
    character,
    ledger,
    owner.choice!,
    [...selected, pick.reference],
    authority,
  )
}
