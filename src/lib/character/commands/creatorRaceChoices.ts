import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { canChangeFeatExpertise } from '@/lib/character/featExpertiseSelections'
import { getFeatSetupOwners } from '@/lib/character/featSetupOwners'
import { canChangeSkilledSkills } from '@/lib/character/featSkillSelections'
import type { ToolProficiencyPools } from '@/lib/character/toolProficiencyChoices'
import { formatProficiencyLabel } from '@/lib/displayLabels'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { isSelectedRaceOwner } from '@/lib/provenance/raceOwnership'
import type { Feat5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'
import { type FeatOptionTarget, isSameGrantSource } from './featCommandIdentity'
import { applyCharacterCommandResult, getFeatChoiceSelectedRefs } from './featCommandSupport'
import {
  commitFeatOptionsCommand,
  removeFeatChoiceCommand,
  resolveConcreteToolChoiceCommand,
  resolveFeatChoiceCommand,
  resolveProficiencyChoiceCommand,
} from './featCommands'
import type { InitialCharacterLookups } from './originSelectionCommand'
import { projectProficiencyCommandResult } from './proficiencyProjection'
import { applyRaceAsiChoicesCommand, applyRaceAsiDistributionCommand } from './raceCommands'

/** Apply edits from the same exact race to a complete Creator draft without rebuilding other owners. */
export function synchronizeCreatorRaceChoices(
  complete: Character,
  raceDraft: Character,
  before: Character,
  resolution: ResolvedRaceReference,
  {
    feats,
    spells,
    lookups,
    toolPools,
    effectiveCharacter,
  }: {
    feats: Feat5e[]
    spells: Spell5e[]
    lookups: InitialCharacterLookups
    toolPools: ToolProficiencyPools
    effectiveCharacter: (character: Character) => Character
  },
): Character {
  const { parentRace, subraceData } = resolution
  if (
    !parentRace ||
    [before, complete, raceDraft].some(
      (character) =>
        character.originSystem !== raceDraft.originSystem ||
        character.race !== parentRace.name ||
        character.raceSource !== parentRace.source ||
        character.subrace !== subraceData?.name ||
        character.subraceSource !== subraceData?.source,
    )
  ) {
    throw new RangeError('Review the choices for your selected race.')
  }
  let current: Character = { ...complete, raceSize: raceDraft.raceSize }
  const apply = (result: ReturnType<typeof resolveFeatChoiceCommand>) => {
    current = applyCharacterCommandResult(current, result)
  }
  const applyFeatOptions = (target: FeatOptionTarget, options: FeatOptionSelections) => {
    const effective = effectiveCharacter(current)
    if (
      !canChangeSkilledSkills(current, effective, target, options, feats) ||
      !canChangeFeatExpertise(current, effective, target, options, feats)
    )
      throw new RangeError(
        `Review ${target.name} on the Race step. Its options conflict with your other choices.`,
      )
    const result = commitFeatOptionsCommand(current, current.provenance, target, options, spells)
    apply(projectProficiencyCommandResult(current, result, lookups.classChoiceFeatureCatalogs))
  }
  for (const choice of raceDraft.provenance.choices) {
    const { id, domain, sourceTag, selected } = choice
    if (!isSelectedRaceOwner(sourceTag, raceDraft)) continue
    const previous = before.provenance.choices.find(
      (row) =>
        row.id === id && row.domain === domain && isSameGrantSource(row.sourceTag, sourceTag),
    )
    if (!previous) continue
    if (domain === 'feats') {
      const [oldFeat] = getFeatChoiceSelectedRefs(previous)
      const [newFeat] = getFeatChoiceSelectedRefs(choice)
      if (JSON.stringify(oldFeat) === JSON.stringify(newFeat)) continue
      if (oldFeat && !newFeat)
        apply(
          removeFeatChoiceCommand(current, current.provenance, id, oldFeat.name, oldFeat.source),
        )
      if (newFeat) {
        if (!oldFeat || getFeatSelectionKey(oldFeat) !== getFeatSelectionKey(newFeat))
          apply(
            resolveFeatChoiceCommand(current, current.provenance, id, {
              name: newFeat.name,
              source: newFeat.source,
            }),
          )
        if (newFeat.options)
          applyFeatOptions({ ...newFeat, provenanceChoiceId: id }, newFeat.options)
      }
    } else if (
      domain === 'skills' ||
      domain === 'languages' ||
      domain === 'tools' ||
      domain === 'armor' ||
      domain === 'weapons'
    ) {
      for (const name of previous.selected.filter((name) => !selected.includes(name)))
        apply(
          resolveProficiencyChoiceCommand(
            current,
            current.provenance,
            domain,
            name,
            false,
            id,
            lookups.classChoiceFeatureCatalogs,
          ),
        )
      for (const name of selected.filter((name) => !previous.selected.includes(name))) {
        const result =
          domain === 'tools'
            ? resolveConcreteToolChoiceCommand(
                current,
                choice,
                name,
                true,
                toolPools,
                lookups.classChoiceFeatureCatalogs,
              )
            : resolveProficiencyChoiceCommand(
                current,
                current.provenance,
                domain,
                name,
                true,
                id,
                lookups.classChoiceFeatureCatalogs,
              )
        if (result.provenanceUpdate === current.provenance)
          throw new RangeError(
            `Choose a different option for ${formatProficiencyLabel(name)} on the Race step. It is unavailable with your other choices.`,
          )
        apply(result)
      }
    }
  }
  const previousFeatOptions = getFeatSetupOwners(before, feats)
  for (const { target, provider, options, focusKey } of getFeatSetupOwners(raceDraft, feats)) {
    if (!target.fixedGrant || !provider || !isSelectedRaceOwner(provider, raceDraft) || !options)
      continue
    if (
      JSON.stringify(previousFeatOptions.find((row) => row.focusKey === focusKey)?.options) ===
      JSON.stringify(options)
    )
      continue
    applyFeatOptions(target, options)
  }
  apply(
    applyRaceAsiDistributionCommand(
      current,
      current.provenance,
      parentRace,
      subraceData,
      raceDraft.raceAsiBlockIndex ?? 0,
    ),
  )
  apply(applyRaceAsiChoicesCommand(current, current.provenance, raceDraft.raceAsiChoices ?? []))
  const racialProfiles = raceDraft.spells.spellProfiles.filter(
    (profile) => profile.type === 'racial',
  )
  current = {
    ...current,
    spells: {
      ...current.spells,
      spellProfiles: [
        ...current.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
        ...racialProfiles,
      ],
    },
  }
  return refreshNativeRacialSpellState(current, resolution, lookups)
}
