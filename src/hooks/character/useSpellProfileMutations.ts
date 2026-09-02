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
import { toast } from 'sonner'
import {
  SPECIAL_SPELL_PROFILE_ID,
  type SpellcastingClassDetail,
} from '@/lib/calculations/spellProfiles'
import type { SpellCommandResult } from '@/lib/character/commands/spellCommands'
import {
  addSpellToCharacter,
  removeRacialSpell as removeRacialSpellCommand,
  removeSpellFromCharacter,
  selectRacialSpell as selectRacialSpellCommand,
  setProfileSpells as setProfileSpellsCommand,
  setRacialCastingAbility as setRacialCastingAbilityCommand,
  syncSpellProfiles,
  toggleSpellPrepared,
} from '@/lib/character/commands/spellCommands'
import { normalizeKey } from '@/lib/provenance/normalization'
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

  const applySpellCommand = useCallback(
    (result: SpellCommandResult) => {
      if (!character) return
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter],
  )

  const syncProfiles = useCallback(() => {
    if (!character || !commandCharacter) return
    applySpellCommand(syncSpellProfiles(commandCharacter, currentLedger, spellProfiles))
  }, [character, commandCharacter, currentLedger, spellProfiles, applySpellCommand])

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
      const profile = spellProfiles.find((entry) => entry.id === profileId)
      const spellKey = normalizeKey(name)
      if (profile?.fixedSpells?.some((fixedName) => normalizeKey(fixedName) === spellKey)) return
      const result = removeSpellFromCharacter(commandCharacter, currentLedger, name, {
        spellKind: kind,
        profileId,
      })
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, spellProfiles, applySpellCommand],
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
      const spellKey = normalizeKey(name)
      if (
        currentProfile.alwaysPreparedSpells?.some(
          (preparedName) => normalizeKey(preparedName) === spellKey,
        )
      ) {
        return
      }

      const isPrepared = currentProfile.preparedSpells.some(
        (preparedName) => normalizeKey(preparedName) === spellKey,
      )
      const detail = spellcastingDetailByProfileId.get(profileId)
      const preparedLimit =
        detail?.isPreparedCaster === true ? (detail.preparedSpellLimit ?? null) : null

      if (!isPrepared) {
        const conflict = spellProfiles.find(
          (p) => p.id !== profileId && p.preparedSpells.includes(name),
        )
        if (conflict) {
          toast.warning(`Already prepared by ${conflict.label}`, {
            description: `${name} is already prepared through your ${conflict.label} profile.`,
          })
          return
        }
      }

      if (
        !isPrepared &&
        preparedLimit !== null &&
        currentProfile.preparedSpells.filter(
          (preparedName) =>
            !currentProfile.alwaysPreparedSpells?.some(
              (alwaysName) => normalizeKey(alwaysName) === normalizeKey(preparedName),
            ),
        ).length >= preparedLimit
      ) {
        return
      }

      const isTruePrepared = !!detail?.isTruePreparedCaster
      const result = toggleSpellPrepared(
        commandCharacter,
        currentLedger,
        profileId,
        name,
        isTruePrepared,
      )
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
      const result = selectRacialSpellCommand(
        commandCharacter,
        currentLedger,
        profileId,
        choiceId,
        spellName,
      )
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, applySpellCommand],
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
      applySpellCommand(result)
    },
    [character, commandCharacter, currentLedger, applySpellCommand],
  )

  const setRacialCastingAbility = useCallback(
    (profileId: string, ability: string) => {
      if (!character || !commandCharacter) return
      applySpellCommand(
        setRacialCastingAbilityCommand(commandCharacter, currentLedger, profileId, ability),
      )
    },
    [character, commandCharacter, currentLedger, applySpellCommand],
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
