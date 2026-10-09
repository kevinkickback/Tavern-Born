import {
  deriveRaceSpellSelection,
  type RaceSpellSelectionOptions,
} from '@/lib/calculations/raceSpellSelection'
import { toRacialProfileId } from '@/lib/calculations/spellProfiles.constants'
import { buildRacialSpellProfile } from '@/lib/calculations/spellProfiles.profiles'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import { isSelectedRaceOwner } from '@/lib/provenance/raceOwnership'
import { reconcileResolvedRacialFixedSpells } from '@/lib/provenance/racialFixedSpells'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { setRacialSpellChoice } from './spellCommands'

/** Rebuild only racial profiles and ownership, preserving all independent casting state. */
export function reconcileRaceSpellProfileCommand(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  options?: Pick<RaceSpellSelectionOptions, 'subraceIsNested'>,
) {
  const selection = deriveRaceSpellSelection(race, subrace, options)
  const totalLevel = getTotalCharacterLevel(character)
  let profile =
    selection.additionalSpells.length > 0
      ? buildRacialSpellProfile({
          raceName: selection.name ?? race.name,
          raceSource: selection.source,
          additionalSpells: selection.additionalSpells,
          totalLevel,
        })
      : undefined
  const previousProfile = character.spells.spellProfiles.find(
    (entry) =>
      entry.type === 'racial' &&
      entry.id === toRacialProfileId(selection.name ?? race.name, selection.source),
  )
  if (
    profile &&
    previousProfile?.castingAbility &&
    (profile.castingAbilityOptions
      ? profile.castingAbilityOptions.includes(previousProfile.castingAbility)
      : profile.castingAbility === previousProfile.castingAbility)
  ) {
    profile = { ...profile, castingAbility: previousProfile.castingAbility }
  }
  let nextCharacter: Character = {
    ...character,
    race: race.name,
    raceSource: race.source || undefined,
    subrace: subrace?.name,
    subraceSource: subrace?.source || undefined,
    spells: {
      ...character.spells,
      spellProfiles: [
        ...character.spells.spellProfiles.filter((entry) => entry.type !== 'racial'),
        ...(profile ? [profile] : []),
      ],
    },
  }
  let provenanceUpdate: ProvenanceLedger = {
    ...ledger,
    spells: Object.fromEntries(
      Object.entries(ledger.spells)
        .map(
          ([key, tags]) =>
            [
              key,
              tags.filter(
                (tag) =>
                  !isSelectedRaceOwner(tag, character) && !isSelectedRaceOwner(tag, nextCharacter),
              ),
            ] as const,
        )
        .filter(([, tags]) => tags.length > 0),
    ),
  }
  provenanceUpdate = reconcileResolvedRacialFixedSpells(nextCharacter, provenanceUpdate, {
    parentRace: race,
    subraceData: subrace,
    subraceIsNested: options?.subraceIsNested ?? false,
  })
  if (profile) {
    for (const choice of profile.choices ?? []) {
      const previousChoice = previousProfile?.choices?.find((entry) => entry.id === choice.id)
      const compatible =
        previousChoice?.isCantrip === choice.isCantrip &&
        previousChoice?.filter?.level === choice.filter?.level &&
        (previousChoice?.filter?.classes ?? []).map(normalizeKey).sort().join('|') ===
          (choice.filter?.classes ?? []).map(normalizeKey).sort().join('|')
      const result = setRacialSpellChoice(
        nextCharacter,
        provenanceUpdate,
        profile.id,
        choice.id,
        compatible ? (previousChoice?.selected ?? []) : [],
      )
      nextCharacter = { ...nextCharacter, ...result.characterPatch }
      provenanceUpdate = result.provenanceUpdate
    }
  }
  return { spells: nextCharacter.spells, provenanceUpdate }
}
