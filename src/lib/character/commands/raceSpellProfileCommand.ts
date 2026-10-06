import {
  deriveRaceSpellSelection,
  type RaceSpellSelectionOptions,
} from '@/lib/calculations/raceSpellSelection'
import { toRacialProfileId } from '@/lib/calculations/spellProfiles.constants'
import { buildRacialSpellProfile } from '@/lib/calculations/spellProfiles.profiles'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { applyRaceSpellGrants, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
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
      : !profile.castingAbility || profile.castingAbility === previousProfile.castingAbility)
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
  const owners = [
    { sourceType: 'race', sourceName: character.race, sourceRef: character.raceSource },
    { sourceType: 'race', sourceName: race.name, sourceRef: race.source },
    { sourceType: 'subrace', sourceName: character.subrace, sourceRef: character.subraceSource },
    { sourceType: 'subrace', sourceName: subrace?.name, sourceRef: subrace?.source },
  ]
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
                  !owners.some(
                    (owner) =>
                      owner.sourceName &&
                      owner.sourceType === tag.sourceType &&
                      owner.sourceName === tag.sourceName &&
                      (!tag.sourceRef || tag.sourceRef === owner.sourceRef),
                  ),
              ),
            ] as const,
        )
        .filter(([, tags]) => tags.length > 0),
    ),
  }
  provenanceUpdate = applyRaceSpellGrants(
    { additionalSpells: selection.parentAdditionalSpells },
    totalLevel,
    provenanceUpdate,
    makeSourceTag('race', race.name, 'fixed', race.source),
  )
  if (subrace) {
    provenanceUpdate = applyRaceSpellGrants(
      { additionalSpells: selection.subraceAdditionalSpells },
      totalLevel,
      provenanceUpdate,
      makeSourceTag('subrace', subrace.name, 'fixed', subrace.source),
    )
  }
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
