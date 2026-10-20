import { useCallback } from 'react'
import { toast } from 'sonner'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  type CharacterCalculationContext,
  createCharacterCalculationContext,
} from '@/lib/calculations/characterCalculationContext'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { isFixedProfileSpell } from '@/lib/calculations/spellOwnership'
import type { SpellcastingClassDetail } from '@/lib/calculations/spellProfiles'
import {
  SPECIAL_SPELL_PROFILE_ID,
  SPECIAL_SPELL_PROFILE_LABEL,
} from '@/lib/calculations/spellProfiles.constants'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import type { SpellCommandResult } from '@/lib/character/commands/spellCommands'
import {
  addSpellToCharacter,
  removeRacialSpell as removeRacialSpellCommand,
  removeSpellFromCharacter,
  selectRacialSpell as selectRacialSpellCommand,
  setProfileSpells as setProfileSpellsCommand,
  setRacialCastingAbility as setRacialCastingAbilityCommand,
  setRacialSpellChoice as setRacialSpellChoiceCommand,
  setRacialSpellSuite as setRacialSpellSuiteCommand,
} from '@/lib/character/commands/spellCommands'
import { preserveDailyClassSpellIntent } from '@/lib/character/dailyClassSpells'
import { isManagedClassSpellProfile } from '@/lib/character/managedClassSpellIdentity'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character, SpellProfile } from '@/types/character'
import type { ManagedClassSpellChoice } from '@/types/classCasting'
import { useSpellProvenanceMutations } from './useSpellProvenanceMutations'

/** Mutations start from latest saved intent, never a filtered display array. */
export function useSpellProfileMutations(
  spellProfiles: SpellProfile[],
  _spellcastingDetailByProfileId: Map<string, SpellcastingClassDetail>,
) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const sourceData = useGameDataStore((state) => state.gameData)
  const calculation = useCharacterCalculationContext(character)
  const { finishClassSpellChoices } = useSpellProvenanceMutations()
  const run = useCallback(
    (
      command: (base: Character, current?: CharacterCalculationContext) => SpellCommandResult,
      requiresCurrent = false,
    ) => {
      const latest = useCharacterStore.getState().activeCharacter
      if (!latest || !character || latest.id !== character.id) return
      try {
        const fresh =
          calculation &&
          hasCurrentCharacterSourceContext(
            latest,
            character,
            useGameDataStore.getState().gameData,
            sourceData,
          )
        if (requiresCurrent && !fresh)
          throw new RangeError('The spell sources changed. Reopen the selection.')
        const current = fresh
          ? createCharacterCalculationContext(
              latest,
              calculation.lookups.primary,
              calculation.lookups.raw,
            )
          : undefined
        let base = current
          ? refreshNativeRacialSpellState(latest, current.raceResolution, {
              spellsByKey: current.lookups.primary.spellsByKey,
              rawSpellsByKey: current.lookups.raw.spellsByKey,
            })
          : latest
        if (!base.spells.spellProfiles.some((profile) => profile.id === SPECIAL_SPELL_PROFILE_ID))
          base = {
            ...base,
            spells: {
              ...base.spells,
              spellProfiles: [
                ...base.spells.spellProfiles,
                {
                  id: SPECIAL_SPELL_PROFILE_ID,
                  type: 'special',
                  label: SPECIAL_SPELL_PROFILE_LABEL,
                  cantrips: [],
                  spellsKnown: [],
                  preparedSpells: [],
                  alwaysPrepared: true,
                },
              ],
            },
          }
        const result = command(base, current)
        if (Object.keys(result.characterPatch).length)
          useCharacterStore.getState().updateCharacter(latest.id, {
            ...result.characterPatch,
            provenance: result.provenanceUpdate,
          })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The spell change could not be saved.')
      }
    },
    [character, calculation, sourceData],
  )
  const choiceFor = (profileId: string, reference: string) => {
    const profile =
      character?.spells.spellProfiles.find((row) => row.id === profileId) ??
      spellProfiles.find((row) => row.id === profileId)
    return (
      profile &&
      character?.managedClassSpellChoices?.find(
        (choice) =>
          isManagedClassSpellProfile(choice.slot, profile) &&
          getSpellReferenceKey(choice.target.name, choice.target.source) ===
            getSpellReferenceKey(reference),
      )
    )
  }
  const clearClassSpellChoice = (choice: ManagedClassSpellChoice) => {
    try {
      finishClassSpellChoices([{ slot: choice.slot, expected: choice }])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The spell change could not be saved.')
    }
  }
  const togglePrepared = (profileId: string, reference: string) => {
    const profile = spellProfiles.find((row) => row.id === profileId)
    if (
      !profile ||
      profile.alwaysPrepared ||
      profile.alwaysPreparedSpells?.some(
        (row) => getSpellReferenceKey(row) === getSpellReferenceKey(reference),
      )
    )
      return
    const choice = choiceFor(profileId, reference)
    if (choice) {
      try {
        finishClassSpellChoices([
          {
            slot: choice.slot,
            expected: choice,
            target: choice.target,
            policy: choice.policy,
            prepare: !choice.prepare,
          },
        ])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The spell change could not be saved.')
      }
      return
    }
    const raw = character?.spells.spellProfiles.find((row) => row.id === profileId)
    const prepared = !raw?.preparedSpells.some(
      (row) => getSpellReferenceKey(row) === getSpellReferenceKey(reference),
    )
    run(
      (base, current) =>
        setDailyClassSpellPreparedCommand(
          base,
          base.provenance,
          profileId,
          reference,
          prepared,
          current
            ? { ...current.classChoices.spellContext, abilityScores: current.abilityScores.total }
            : undefined,
        ),
      prepared,
    )
  }
  const removeSpellFromProfile = (
    profileId: string,
    reference: string,
    kind: 'cantrip' | 'spell',
  ) => {
    const choice = choiceFor(profileId, reference)
    if (choice) {
      try {
        finishClassSpellChoices([{ slot: choice.slot, expected: choice }])
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The spell change could not be saved.')
      }
      return
    }
    run((base) => {
      const profile = base.spells.spellProfiles.find((row) => row.id === profileId)
      if (profile && isFixedProfileSpell(profile, base.provenance, reference))
        return { characterPatch: {}, provenanceUpdate: base.provenance }
      return removeSpellFromCharacter(base, base.provenance, reference, {
        spellKind: kind,
        profileId,
      })
    })
  }
  return {
    clearClassSpellChoice,
    syncProfiles: () =>
      run((base, current) => {
        if (!current) return { characterPatch: {}, provenanceUpdate: base.provenance }
        const next = preserveDailyClassSpellIntent(base, current.character)
        return { characterPatch: { spells: next.spells }, provenanceUpdate: next.provenance }
      }, true),
    addSpellToProfile: (profileId: string, name: string, kind: 'cantrip' | 'spell') =>
      run((base, current) =>
        addSpellToCharacter(base, base.provenance, name, kind, profileId, {
          spellsByKey: current?.lookups.primary.spellsByKey,
        }),
      ),
    setProfileSpells: (profileId: string, cantrips: string[], known: string[]) =>
      run((base, current) =>
        setProfileSpellsCommand(
          base,
          base.provenance,
          profileId,
          cantrips,
          known,
          current?.lookups.primary.spellsByKey,
        ),
      ),
    removeSpellFromProfile,
    togglePrepared,
    selectRacialSpell: (profileId: string, choiceId: string, name: string) =>
      run(
        (base, current) =>
          selectRacialSpellCommand(
            base,
            base.provenance,
            profileId,
            choiceId,
            name,
            current?.raceResolution,
            current?.lookups.primary.spellsByKey,
          ),
        true,
      ),
    removeRacialSpell: (profileId: string, choiceId: string, name: string) =>
      run((base) => removeRacialSpellCommand(base, base.provenance, profileId, choiceId, name)),
    setRacialSpellChoice: (profileId: string, choiceId: string, selected: string[]) =>
      run(
        (base, current) =>
          setRacialSpellChoiceCommand(
            base,
            base.provenance,
            profileId,
            choiceId,
            selected,
            current?.raceResolution,
            current?.lookups.primary.spellsByKey,
          ),
        selected.some(
          (target) =>
            !character?.spells.spellProfiles
              .find((row) => row.id === profileId)
              ?.choices?.find((row) => row.id === choiceId)
              ?.selected.some((row) => getSpellReferenceKey(row) === getSpellReferenceKey(target)),
        ),
      ),
    setRacialSpellSuite: (profileId: string, suiteId: string | undefined) =>
      run(
        (base, current) =>
          setRacialSpellSuiteCommand(
            base,
            base.provenance,
            profileId,
            suiteId,
            current?.raceResolution,
            current?.lookups.primary.spellsByKey,
          ),
        suiteId !== undefined,
      ),
    setRacialCastingAbility: (profileId: string, ability: string) =>
      run(
        (base, current) =>
          setRacialCastingAbilityCommand(
            base,
            base.provenance,
            profileId,
            ability,
            current?.raceResolution,
            current?.lookups.primary.spellsByKey,
          ),
        !!ability.trim(),
      ),
  }
}
