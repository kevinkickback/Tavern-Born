import { getCharacterSheetTemplate } from './characterSheetTemplates'
import type { CharacterSheetViewModel } from './characterSheetViewModel'
import type { CharacterSheetPageOptions, CharacterSheetTemplateId } from './types'

/** User choices override content-based defaults without changing the character. */
export function getOptionalCharacterSheetPages(
  viewModel: CharacterSheetViewModel,
  templateId: CharacterSheetTemplateId,
  choices: CharacterSheetPageOptions = {},
) {
  const defaults: Required<CharacterSheetPageOptions> = {
    spells:
      viewModel.spellcastingDetails.some(
        (detail) => detail.maxSpellLevel > 0 || (detail.cantripLimit ?? 0) > 0,
      ) ||
      viewModel.spellRows.length > 0 ||
      viewModel.character.spells.spellProfiles.some(
        (profile) =>
          (profile.type === 'class' &&
            !viewModel.spellcastingDetails.some((detail) => detail.profileId === profile.id)) ||
          (profile.choices?.length ?? 0) > 0,
      ),
    companion: viewModel.companions.length > 0,
    notes: getCharacterSheetTemplate(templateId).id === '2014-custom',
  }
  return (getCharacterSheetTemplate(templateId).optionalPages ?? []).map((page) => ({
    ...page,
    included: choices[page.id] ?? defaults[page.id],
  }))
}
