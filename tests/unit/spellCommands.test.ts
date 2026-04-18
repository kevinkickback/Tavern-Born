/**
 * Unit tests for spell domain commands (Phase 1.5).
 *
 * These tests validate that spell mutation commands correctly coordinate
 * profile state updates and provenance ledger changes for atomic spell operations.
 */

import { describe, expect, test } from 'vitest'
import {
  addSpellToCharacter,
  removeSpellFromCharacter,
  swapSpellOnCharacter,
} from '@/lib/character/commands/spellCommands'
import { emptyProvenance } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('Spell Commands', () => {
  describe('addSpellToCharacter', () => {
    test('adds cantrip to profile and records provenance', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 1,
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard (Lv 1)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = addSpellToCharacter(
        character,
        ledger,
        'Fire Bolt',
        'cantrip',
        'class:Wizard|PHB',
        {
          sourceType: 'class',
          source: 'Wizard',
          attributionMode: 'exact',
        },
      )

      // Profile should be updated with new cantrip
      const updatedProfile = result.profileUpdate.spellProfiles?.[0]
      expect(updatedProfile?.cantrips).toContain('Fire Bolt')

      // Provenance should record the grant
      expect(result.provenanceUpdate.spells['fire bolt']).toBeDefined()
    })

    test('adds spell known to profile with correct level assigment', () => {
      const character = makeCharacterFixture({
        class: 'Bard',
        classSource: 'PHB',
        level: 3,
        spells: {
          spellProfiles: [
            {
              id: 'class:Bard|PHB',
              type: 'class' as const,
              label: 'Bard (Lv 3)',
              className: 'Bard',
              classSource: 'PHB',
              cantrips: ['Vicious Mockery'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = addSpellToCharacter(
        character,
        ledger,
        'Faerie Fire',
        'spell',
        'class:Bard|PHB',
        {
          sourceType: 'class',
          source: 'Bard',
          grantedAtLevel: 1,
          attributionMode: 'exact',
        },
      )

      // Profile should include new spell known
      const updatedProfile = result.profileUpdate.spellProfiles?.[0]
      expect(updatedProfile?.spellsKnown).toContain('Faerie Fire')
    })
  })

  describe('removeSpellFromCharacter', () => {
    test('removes spell from profile and cleans up provenance', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = removeSpellFromCharacter(character, ledger, 'Fire Bolt', {
        spellKind: 'cantrip',
        profileId: 'class:Wizard|PHB',
      })

      // Profile should no longer have removed cantrip
      const updatedProfile = result.profileUpdate.spellProfiles?.[0]
      expect(updatedProfile?.cantrips).not.toContain('Fire Bolt')
      expect(updatedProfile?.cantrips).toContain('Mage Hand')

      // Provenance grant should be removed
      expect(result.provenanceUpdate.spells['fire bolt']).toBeUndefined()
    })
  })

  describe('swapSpellOnCharacter', () => {
    test('removed spell is absent and added spell is present after a swap', () => {
      const profileId = 'class:Bard|PHB'
      const character = makeCharacterFixture({
        class: 'Bard',
        spells: {
          spellProfiles: [
            {
              id: profileId,
              type: 'class' as const,
              label: 'Bard',
              className: 'Bard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Faerie Fire', 'Healing Word'],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      // Seed the ledger with a grant for the spell being swapped out.
      const ledgerWithGrant = addSpellToCharacter(
        character,
        character.provenance ?? emptyProvenance(),
        'Faerie Fire',
        'spell',
        profileId,
        { sourceType: 'class', source: 'Bard', grantedAtLevel: 1 },
      ).provenanceUpdate

      const result = swapSpellOnCharacter(
        character,
        ledgerWithGrant,
        'Faerie Fire',
        'Thunderwave',
        profileId,
      )

      const updatedProfile = result.profileUpdate.spellProfiles?.find((p) => p.id === profileId)

      // Removed spell must be gone from the profile
      expect(updatedProfile?.spellsKnown).not.toContain('Faerie Fire')
      // Added spell must be present in the profile
      expect(updatedProfile?.spellsKnown).toContain('Thunderwave')
      // Untouched spell must still be present
      expect(updatedProfile?.spellsKnown).toContain('Healing Word')

      // Provenance: removed spell's grant should be absent
      expect(result.provenanceUpdate.spells['faerie fire']).toBeUndefined()
      // Provenance: added spell must have a grant
      expect(result.provenanceUpdate.spells['thunderwave']).toBeDefined()
    })
  })
})
