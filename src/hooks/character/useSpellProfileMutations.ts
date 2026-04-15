/**
 * Spell profile mutation hook.
 *
 * Handles all write operations for spell profiles: adding/removing spells,
 * toggling prepared state, managing racial spell choices, and syncing profiles.
 *
 * Accepts the pre-computed `spellProfiles` and `spellcastingDetailByProfileId`
 * from `useSpellSlots` so that mutations observe the same derived state.
 */

import { useCallback, useMemo } from 'react'
import {
  SPECIAL_SPELL_PROFILE_ID,
  type SpellcastingClassDetail,
} from '@/lib/calculations/spellProfiles'
import {
  addSpellToCharacter,
  removeRacialSpell as removeRacialSpellCommand,
  removeSpellFromCharacter,
  selectRacialSpell as selectRacialSpellCommand,
  setProfileSpells as setProfileSpellsCommand,
  toggleSpellPrepared,
} from '@/lib/character/commands/spellCommands'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { SpellProfile } from '@/types/character'

function getDefaultProfileId(profiles: SpellProfile[]): string {
  const firstClass = profiles.find((profile) => profile.type === 'class')
  return firstClass?.id ?? SPECIAL_SPELL_PROFILE_ID
}

function getSpellSourceMeta(profile: SpellProfile): {
  sourceType: 'class' | 'subclass' | 'feat' | 'manual'
  source: string
} {
  if (profile.type === 'class') {
    return { sourceType: 'class', source: profile.className ?? profile.label }
  }
  return { sourceType: 'manual', source: 'User Choice' }
}

export function useSpellProfileMutations(
  spellProfiles: SpellProfile[],
  spellcastingDetailByProfileId: Map<string, SpellcastingClassDetail>,
) {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const currentLedger = character?.provenance ?? emptyProvenance()

  const commandCharacter = useMemo(() => {
    if (!character) return null
    return {
      ...character,
      spells: {
        ...character.spells,
        spellProfiles,
      },
    }
  }, [character, spellProfiles])

  const patchSpells = useCallback(
    (patch: Partial<NonNullable<typeof character>['spells']>) => {
      if (!character) return
      updateCharacter(character.id, {
        spells: { ...character.spells, ...patch },
      })
    },
    [character, updateCharacter],
  )

  const applySpellCommand = useCallback(
    (result: {
      profileUpdate: Partial<NonNullable<typeof character>['spells']>
      provenanceUpdate: NonNullable<typeof character>['provenance']
    }) => {
      if (!character) return
      updateCharacter(character.id, {
        spells: {
          ...(commandCharacter?.spells ?? character.spells),
          ...result.profileUpdate,
        },
        provenance: result.provenanceUpdate,
      })
    },
    [character, commandCharacter, updateCharacter],
  )

  const syncProfiles = useCallback(() => {
    if (!character) return
    patchSpells({ spellProfiles })
  }, [character, patchSpells, spellProfiles])

  const addSpellToProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character || !commandCharacter) return
      const profile = spellProfiles.find((p) => p.id === profileId)
      const sourceMeta = profile
        ? getSpellSourceMeta(profile)
        : { sourceType: 'manual' as const, source: 'User Choice' }
      const result = addSpellToCharacter(
        commandCharacter,
        currentLedger,
        name,
        kind,
        profileId,
        sourceMeta,
      )
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, spellProfiles, applySpellCommand],
  )

  const setProfileSpells = useCallback(
    (profileId: string, cantrips: string[], spellsKnown: string[]) => {
      if (!character || !commandCharacter) return
      const result = setProfileSpellsCommand(
        commandCharacter,
        currentLedger,
        profileId,
        cantrips,
        spellsKnown,
      )
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, applySpellCommand],
  )

  const removeSpellFromProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character || !commandCharacter) return
      const result = removeSpellFromCharacter(commandCharacter, currentLedger, name, {
        spellKind: kind,
        profileId,
      })
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, applySpellCommand],
  )

  /**
   * @deprecated Use addSpellToProfile(profileId, name, 'cantrip') directly.
   */
  const addCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'cantrip')
    },
    [addSpellToProfile, spellProfiles],
  )

  /**
   * @deprecated Use removeSpellFromProfile(profileId, name, 'cantrip') directly.
   */
  const removeCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      removeSpellFromProfile(targetId, name, 'cantrip')
    },
    [removeSpellFromProfile, spellProfiles],
  )

  /**
   * @deprecated Use addSpellToProfile(profileId, name, 'spell') directly.
   */
  const addSpellKnown = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'spell')
    },
    [addSpellToProfile, spellProfiles],
  )

  /**
   * @deprecated Use removeSpellFromProfile(profileId, name, 'spell') directly.
   */
  const removeSpellKnown = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      removeSpellFromProfile(targetId, name, 'spell')
    },
    [removeSpellFromProfile, spellProfiles],
  )

  const togglePrepared = useCallback(
    (profileId: string, name: string) => {
      if (!character || !commandCharacter) return
      const currentProfile = spellProfiles.find((profile) => profile.id === profileId)
      if (!currentProfile || currentProfile.alwaysPrepared) return

      const isPrepared = currentProfile.preparedSpells.includes(name)
      const detail = spellcastingDetailByProfileId.get(profileId)
      const preparedLimit =
        detail?.isPreparedCaster === true ? (detail.preparedSpellLimit ?? null) : null

      if (
        !isPrepared &&
        preparedLimit !== null &&
        currentProfile.preparedSpells.length >= preparedLimit
      ) {
        return
      }

      const result = toggleSpellPrepared(commandCharacter, currentLedger, profileId, name)
      applySpellCommand(result)
    },
    [
      character,
      commandCharacter,
      currentLedger,
      applySpellCommand,
      spellProfiles,
      spellcastingDetailByProfileId,
    ],
  )

  const selectRacialSpell = useCallback(
    (profileId: string, choiceId: string, spellName: string) => {
      if (!character || !commandCharacter) return

      const profile = spellProfiles.find((p) => p.id === profileId)
      const isCantrip = !!(
        profile?.type === 'racial' &&
        profile.choices?.find((choice) => choice.id === choiceId)?.isCantrip
      )

      const result = selectRacialSpellCommand(
        commandCharacter,
        currentLedger,
        profileId,
        choiceId,
        spellName,
      )

      const mergedProfiles = spellProfiles.map((profileEntry) => {
        if (
          profileEntry.id !== profileId ||
          profileEntry.type !== 'racial' ||
          !profileEntry.choices
        ) {
          return profileEntry
        }
        const nextChoices = profileEntry.choices.map((choice) => {
          if (choice.id !== choiceId) return choice
          if (choice.selected.includes(spellName)) return choice
          if (choice.selected.length >= choice.count) return choice
          return { ...choice, selected: [...choice.selected, spellName] }
        })
        return {
          ...profileEntry,
          choices: nextChoices,
          cantrips: isCantrip
            ? [
                ...new Set([
                  ...(result.profileUpdate.spellProfiles?.find((p) => p.id === profileId)
                    ?.cantrips ?? profileEntry.cantrips),
                ]),
              ]
            : profileEntry.cantrips,
          spellsKnown: isCantrip
            ? profileEntry.spellsKnown
            : [
                ...new Set([
                  ...(result.profileUpdate.spellProfiles?.find((p) => p.id === profileId)
                    ?.spellsKnown ?? profileEntry.spellsKnown),
                ]),
              ],
        }
      })

      updateCharacter(character.id, {
        spells: { ...character.spells, spellProfiles: mergedProfiles },
        provenance: result.provenanceUpdate,
      })
    },
    [character, commandCharacter, currentLedger, spellProfiles, updateCharacter],
  )

  const removeRacialSpell = useCallback(
    (profileId: string, choiceId: string, spellName: string) => {
      if (!character || !commandCharacter) return
      const result = removeRacialSpellCommand(
        commandCharacter,
        currentLedger,
        profileId,
        choiceId,
        spellName,
      )
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.type !== 'racial' || !profile.choices) {
          return profile
        }
        const nextChoices = profile.choices.map((choice) => {
          if (choice.id !== choiceId) return choice
          return { ...choice, selected: choice.selected.filter((s) => s !== spellName) }
        })
        return {
          ...profile,
          choices: nextChoices,
          cantrips: profile.cantrips.filter((s) => s !== spellName),
          spellsKnown: profile.spellsKnown.filter((s) => s !== spellName),
        }
      })
      updateCharacter(character.id, {
        spells: {
          ...character.spells,
          spellProfiles: nextProfiles,
        },
        provenance: result.provenanceUpdate,
      })
    },
    [character, commandCharacter, currentLedger, spellProfiles, updateCharacter],
  )

  const setRacialCastingAbility = useCallback(
    (profileId: string, ability: string) => {
      if (!character) return
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.type !== 'racial') return profile
        return { ...profile, castingAbility: ability }
      })
      patchSpells({ spellProfiles: nextProfiles })
    },
    [character, patchSpells, spellProfiles],
  )

  return {
    syncProfiles,
    addCantrip,
    removeCantrip,
    addSpellKnown,
    removeSpellKnown,
    addSpellToProfile,
    setProfileSpells,
    removeSpellFromProfile,
    togglePrepared,
    selectRacialSpell,
    removeRacialSpell,
    setRacialCastingAbility,
  }
}
