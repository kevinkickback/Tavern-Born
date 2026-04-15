/**
 * Unified spell mutation hook.
 *
 * Provides a simplified interface to the spell domain commands and applies
 * profile updates together with provenance ledger changes.
 */

import { useCallback } from 'react'
import {
  addSpellToCharacter,
  removeSpellFromCharacter,
  setProfileSpells,
  toggleSpellPrepared,
} from '@/lib/character/commands/spellCommands'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

/**
 * Coordinates spell profile updates with provenance updates.
 */
export function useSpellMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const isActiveCharacter = useCharacterStore((s) => s.activeCharacterId === character?.id)
  const currentLedger = character?.provenance ?? emptyProvenance()

  const updateProvenanceIfAvailable = useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character || !isActiveCharacter) return
      updateCharacter(character.id, { provenance: newLedger })
    },
    [character, updateCharacter, isActiveCharacter],
  )

  /**
   * Add a spell (cantrip or spell known) to a character's spell profile.
   * Coordinates profile state and provenance attribution in a single operation.
   */
  const addSpell = useCallback(
    (
      spellName: string,
      spellKind: 'cantrip' | 'spell',
      profileId?: string,
      options?: {
        source?: string
        sourceType?: 'class' | 'subclass' | 'feat' | 'manual'
        grantedAtLevel?: number
        attributionMode?: 'exact' | 'inferred-lowest-eligible'
      },
    ) => {
      if (!character) return

      const result = addSpellToCharacter(
        character,
        currentLedger,
        spellName,
        spellKind,
        profileId,
        options,
      )

      // Apply both updates atomically
      updateCharacter(character.id, { spells: { ...character.spells, ...result.profileUpdate } })
      updateProvenanceIfAvailable(result.provenanceUpdate)
    },
    [character, currentLedger, updateCharacter, updateProvenanceIfAvailable],
  )

  /**
   * Remove a spell from a character's spell profile.
   * Coordinates profile state and provenance cleanup in a single operation.
   */
  const removeSpell = useCallback(
    (spellName: string, spellKind: 'cantrip' | 'spell', profileId?: string) => {
      if (!character) return

      const result = removeSpellFromCharacter(character, currentLedger, spellName, {
        spellKind,
        profileId,
      })

      // Apply both updates atomically
      updateCharacter(character.id, { spells: { ...character.spells, ...result.profileUpdate } })
      updateProvenanceIfAvailable(result.provenanceUpdate)
    },
    [character, currentLedger, updateCharacter, updateProvenanceIfAvailable],
  )

  /**
   * Toggle prepared status for a spell in a profile.
   * For prepared casters like clerics, paladins, druids, etc.
   */
  const togglePreparedStatus = useCallback(
    (spellName: string, profileId: string) => {
      if (!character) return

      const result = toggleSpellPrepared(character, currentLedger, profileId, spellName)

      // Apply both updates atomically
      updateCharacter(character.id, { spells: { ...character.spells, ...result.profileUpdate } })
      updateProvenanceIfAvailable(result.provenanceUpdate)
    },
    [character, currentLedger, updateCharacter, updateProvenanceIfAvailable],
  )

  const replaceProfileSpells = useCallback(
    (profileId: string, cantrips: string[], spellsKnown: string[]) => {
      if (!character) return
      const result = setProfileSpells(character, currentLedger, profileId, cantrips, spellsKnown)
      updateCharacter(character.id, { spells: { ...character.spells, ...result.profileUpdate } })
      updateProvenanceIfAvailable(result.provenanceUpdate)
    },
    [character, currentLedger, updateCharacter, updateProvenanceIfAvailable],
  )

  return {
    addSpell,
    removeSpell,
    togglePreparedStatus,
    replaceProfileSpells,
  }
}
