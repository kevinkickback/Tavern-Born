import { decodeProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { stripFeatExpertiseGrants } from '@/lib/character/featExpertiseSelections'
import {
  type ExpertiseAuthority,
  getSkillExpertiseChoices,
} from '@/lib/character/skillExpertiseChoices'
import { addGrant, normalizeKey } from '@/lib/provenance'
import type { Character } from '@/types/character'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from './classChoiceCommands'
import type { CharacterCommandResult } from './commandResult'
import { toggleExpertiseCommand } from './expertiseCommands'
import { getFeatOptionSourceTag } from './featCommandIdentity'
import { storeFeatOptionSelections } from './featOptionState'
import { projectProficiencyCommandResult } from './proficiencyProjection'

/** Re-read current authority at confirmation; a stale menu cannot allocate a disappeared owner. */
export function applySkillExpertiseActionCommand(
  character: Character,
  skillName: string,
  actionId: string,
  authority: ExpertiseAuthority,
): CharacterCommandResult {
  const model = getSkillExpertiseChoices(character, authority)
  const name = normalizeKey(skillName)
  const action = model.actions[name]?.find((row) => row.id === actionId)
  if (!action) return { characterPatch: {}, provenanceUpdate: character.provenance }
  if (action.kind === 'legacy')
    return projectProficiencyCommandResult(
      character,
      toggleExpertiseCommand(character, character.provenance, name, action.adding),
      { ...authority.catalogs, featExpertiseFeats: authority.feats },
    )
  if (action.kind === 'class') {
    const owner = model.classOwners.find((row) => row.id === action.ownerId)!
    const selected = owner.selection?.selected ?? []
    if (!action.adding)
      return retainSavedFeatureOptionsCommand(
        character,
        character.provenance,
        owner.id,
        selected
          .filter((pick) => decodeProficiencyOption(pick)?.name !== name)
          .map(getClassChoiceOptionKey),
        authority,
      )
    const pick = owner.options.find(
      (option) => decodeProficiencyOption(option.reference)?.name === name,
    )!
    return applyClassChoiceSelectionWithGrantsCommand(
      character,
      character.provenance,
      owner.choice!,
      [...selected, pick.reference],
      authority,
    )
  }
  const owner = model.featOwners.find((row) => row.id === action.ownerId)!
  const base = stripFeatExpertiseGrants(character, owner.id)
  const options = { ...owner.options }
  if (action.adding) options.expertiseSkill = name
  else delete options.expertiseSkill
  const stored = storeFeatOptionSelections(base, base.provenance, owner.target, options)
  const result = !action.adding
    ? {
        ...stored,
        characterPatch: { ...stored.characterPatch, proficiencies: base.proficiencies },
      }
    : {
        ...stored,
        characterPatch: {
          ...stored.characterPatch,
          proficiencies: {
            ...base.proficiencies,
            expertise: [...new Set([...base.proficiencies.expertise, name])],
          },
        },
        provenanceUpdate: addGrant(
          stored.provenanceUpdate,
          'expertise',
          name,
          getFeatOptionSourceTag(owner.target),
        ),
      }
  const projected = refreshClassProficiencyState(
    { ...base, ...result.characterPatch, provenance: result.provenanceUpdate },
    authority.classes,
    { ...authority.catalogs, featExpertiseFeats: authority.feats },
  )
  return projectProficiencyCommandResult(
    character,
    {
      ...result,
      characterPatch: { ...result.characterPatch, proficiencies: projected.proficiencies },
      provenanceUpdate: projected.provenance,
    },
    { ...authority.catalogs, featExpertiseFeats: authority.feats },
  )
}
