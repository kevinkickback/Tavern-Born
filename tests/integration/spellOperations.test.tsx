import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { GrantType, SourceType } from '@/lib/provenance/types'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

/**
 * Integration tests for spell profile updates and provenance tracking.
 */

describe('Spell Operations', () => {
  describe('Adding spells (profile + provenance)', () => {
    test('addCantrip adds to profile and applySpellSelection updates provenance', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 1,
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
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

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      const { result: spellSlotsResult } = renderHook(() => useSpellSlots())
      const { result: provenanceResult } = renderHook(() => useProvenance())

      // Add cantrip via profile mutation
      act(() => {
        spellSlotsResult.current.addCantrip('Fire Bolt', 'class:Wizard|PHB')
      })

      // Verify profile state updated
      const updatedChar = useCharacterStore.getState().activeCharacter
      expect(updatedChar?.spells.spellProfiles[0].cantrips).toContain('Fire Bolt')

      // Apply provenance mutation separately
      act(() => {
        provenanceResult.current.applySpellSelection('Wizard', 'PHB', 'Fire Bolt')
      })

      // Verify provenance updated
      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      expect(ledger?.spells['fire bolt']).toBeDefined()
      expect(ledger?.spells['fire bolt']?.[0]).toMatchObject({
        sourceType: 'class',
        sourceName: 'Wizard',
      })
    })

    test('addSpellKnown adds to profile (currently requires manual provenance)', () => {
      const character = makeCharacterFixture({
        class: 'Bard',
        classSource: 'PHB',
        level: 3,
        classProgression: [{ name: 'Bard', source: 'PHB', levels: 3 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Bard|PHB',
              type: 'class',
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

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })
      const { result } = renderHook(() => useSpellSlots())

      // Add spell known via profile mutation
      act(() => {
        result.current.addSpellKnown('Healing Word', 'class:Bard|PHB')
      })

      const updatedChar = useCharacterStore.getState().activeCharacter
      expect(updatedChar?.spells.spellProfiles[0].spellsKnown).toContain('Healing Word')
    })

    test('setProfileSpells replaces spell list on a profile', () => {
      const character = makeCharacterFixture({
        class: 'Cleric',
        classSource: 'PHB',
        level: 5,
        classProgression: [{ name: 'Cleric', source: 'PHB', levels: 5 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Cleric|PHB',
              type: 'class',
              label: 'Cleric (Lv 5)',
              className: 'Cleric',
              classSource: 'PHB',
              cantrips: ['Sacred Flame', 'Guidance'],
              spellsKnown: ['Cure Wounds', 'Guiding Bolt'],
              preparedSpells: ['Cure Wounds', 'Guiding Bolt'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })
      const { result } = renderHook(() => useSpellSlots())

      act(() => {
        result.current.setProfileSpells(
          'class:Cleric|PHB',
          ['Sacred Flame'], // Keep only one cantrip
          ['Cure Wounds', 'Lesser Restoration'], // Swap Guiding Bolt for Lesser Restoration
        )
      })

      const updatedChar = useCharacterStore.getState().activeCharacter
      const profile = updatedChar?.spells.spellProfiles[0]
      expect(profile?.cantrips).toEqual(['Sacred Flame'])
      expect(profile?.spellsKnown).toEqual(['Cure Wounds', 'Lesser Restoration'])
    })
  })

  describe('Removing spells (profile + provenance)', () => {
    test('removeCantrip removes from profile; removeSpellProvenance removes from attribution', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 3,
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 3)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt', 'Mage Hand'],
              spellsKnown: ['Magic Missile'],
              preparedSpells: ['Magic Missile'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const mockLedger = makeLedgerWithSpellEntry('Fire Bolt', {
        sourceType: 'class',
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        grantType: 'choice',
      })

      useCharacterStore.setState({
        activeCharacter: { ...character, provenance: mockLedger },
        activeCharacterId: character.id,
        characters: [{ ...character, provenance: mockLedger }],
      })

      const { result: spellSlotsResult } = renderHook(() => useSpellSlots())
      const { result: provenanceResult } = renderHook(() => useProvenance())

      // Remove from profile
      act(() => {
        spellSlotsResult.current.removeCantrip('Fire Bolt', 'class:Wizard|PHB')
      })

      const updatedChar = useCharacterStore.getState().activeCharacter
      expect(updatedChar?.spells.spellProfiles[0].cantrips).not.toContain('Fire Bolt')

      // Remove from provenance
      act(() => {
        provenanceResult.current.removeSpellProvenance('Fire Bolt')
      })

      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      expect(ledger?.spells['fire bolt']).toBeUndefined()
    })

    test('removeSpellKnown cleans up prepared spells list', () => {
      const character = makeCharacterFixture({
        class: 'Druid',
        classSource: 'PHB',
        level: 5,
        classProgression: [{ name: 'Druid', source: 'PHB', levels: 5 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Druid|PHB',
              type: 'class',
              label: 'Druid (Lv 5)',
              className: 'Druid',
              classSource: 'PHB',
              cantrips: ['Thorn Whip'],
              spellsKnown: ['Cure Wounds', 'Entangle'],
              preparedSpells: ['Cure Wounds', 'Entangle'], // Both prepared
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })
      const { result } = renderHook(() => useSpellSlots())

      act(() => {
        result.current.removeSpellKnown('Entangle', 'class:Druid|PHB')
      })

      const updatedChar = useCharacterStore.getState().activeCharacter
      const profile = updatedChar?.spells.spellProfiles[0]
      expect(profile?.spellsKnown).not.toContain('Entangle')
      // Should also be removed from prepared since it's no longer known
      expect(profile?.preparedSpells).not.toContain('Entangle')
    })
  })

  describe('Swapping spells (atomic provenance operation)', () => {
    test('swapSpellProvenance maintains grant level attribution when replacing a choice', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 6,
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 6 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 6)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Magic Missile'],
              preparedSpells: ['Magic Missile'],
              alwaysPrepared: false,
            },
            {
              id: 'special:unrestricted',
              type: 'special',
              label: 'Special (Unrestricted)',
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: true,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const mockLedger = makeLedgerWithSpellEntry('Magic Missile', {
        sourceType: 'class',
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        grantType: 'choice',
        spellGrantedAtLevel: 1,
      })

      useCharacterStore.setState({
        activeCharacter: { ...character, provenance: mockLedger },
        activeCharacterId: character.id,
        characters: [{ ...character, provenance: mockLedger }],
      })

      const { result } = renderHook(() => useProvenance())

      // Swap Magic Missile for Chromatic Orb (keeping level attribution)
      act(() => {
        result.current.swapSpellProvenance('Wizard', 'PHB', 'Magic Missile', 'Chromatic Orb')
      })

      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      expect(ledger?.spells['magic missile']).toBeUndefined()
      expect(ledger?.spells['chromatic orb']).toBeDefined()
      expect(ledger?.spells['chromatic orb']?.[0].spellGrantedAtLevel).toBe(1)
    })

    test('swapSpellProvenance preserves unrelated grants on the replaced spell', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 6,
      })

      // Spell has multiple grants: one from class choice, one from feat
      const mockLedger = {
        ...makeCharacterFixture().provenance!,
        spells: {
          fireball: [
            {
              sourceType: 'class' as const,
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice' as const,
              spellGrantedAtLevel: 3,
              label: 'Wizard',
            },
            {
              sourceType: 'feat' as const,
              sourceName: 'Elemental Adept',
              sourceRef: 'PHB',
              grantType: 'choice' as const,
              label: 'Elemental Adept',
            },
          ],
        },
      }

      useCharacterStore.setState({
        activeCharacter: { ...character, provenance: mockLedger },
        activeCharacterId: character.id,
        characters: [{ ...character, provenance: mockLedger }],
      })

      const { result } = renderHook(() => useProvenance())

      // Swap only the class grant, keep feat grant on fireball
      act(() => {
        result.current.swapSpellProvenance('Wizard', 'PHB', 'Fireball', 'Cone of Cold')
      })

      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      // Fireball should retain only feat grant
      expect(ledger?.spells.fireball).toHaveLength(1)
      expect(ledger?.spells.fireball?.[0].sourceType).toBe('feat')
      // New spell gets class grant with inherited level
      expect(ledger?.spells['cone of cold']?.[0].spellGrantedAtLevel).toBe(3)
    })
  })

  describe('Manual spell grants', () => {
    test('applyManualSpellGrant adds spell to provenance with manual source tag', () => {
      const character = makeCharacterFixture({
        class: 'Rogue',
        classSource: 'PHB',
        level: 3,
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      const { result } = renderHook(() => useProvenance())

      act(() => {
        result.current.applyManualSpellGrant('Find Familiar')
      })

      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      expect(ledger?.spells['find familiar']).toBeDefined()
      expect(ledger?.spells['find familiar']?.[0]).toMatchObject({
        sourceType: 'manual',
        sourceName: 'User Choice',
        grantType: 'choice',
      })
    })

    test('removeSpellProvenance removes all tags for a spell', () => {
      const character = makeCharacterFixture({
        class: 'Cleric',
        classSource: 'PHB',
        level: 5,
      })

      const mockLedger = makeLedgerWithSpellEntry('Cure Wounds', {
        sourceType: 'class',
        sourceName: 'Cleric',
        sourceRef: 'PHB',
        grantType: 'choice',
      })

      useCharacterStore.setState({
        activeCharacter: { ...character, provenance: mockLedger },
        activeCharacterId: character.id,
        characters: [{ ...character, provenance: mockLedger }],
      })

      const { result } = renderHook(() => useProvenance())

      act(() => {
        result.current.removeSpellProvenance('Cure Wounds')
      })

      const ledger = useCharacterStore.getState().activeCharacter?.provenance
      expect(ledger?.spells['cure wounds']).toBeUndefined()
    })
  })

  describe('Prepared spells', () => {
    test('togglePrepared updates prepared list for prepared casters', () => {
      const character = makeCharacterFixture({
        class: 'Cleric',
        classSource: 'PHB',
        level: 5,
        classProgression: [{ name: 'Cleric', source: 'PHB', levels: 5 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Cleric|PHB',
              type: 'class',
              label: 'Cleric (Lv 5)',
              className: 'Cleric',
              classSource: 'PHB',
              cantrips: ['Cure Wounds'],
              spellsKnown: ['Bless', 'Guiding Bolt', 'Healing Word'],
              preparedSpells: ['Bless', 'Guiding Bolt'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })
      const { result } = renderHook(() => useSpellSlots())

      // Prepare an unprepared spell
      act(() => {
        result.current.togglePrepared('class:Cleric|PHB', 'Healing Word')
      })

      let profile = useCharacterStore.getState().activeCharacter?.spells.spellProfiles[0]
      expect(profile?.preparedSpells).toContain('Healing Word')

      // Unprepare a prepared spell
      act(() => {
        result.current.togglePrepared('class:Cleric|PHB', 'Bless')
      })

      profile = useCharacterStore.getState().activeCharacter?.spells.spellProfiles[0]
      expect(profile?.preparedSpells).not.toContain('Bless')
    })
  })
})

// Helper functions for test setup

function makeLedgerWithSpellEntry(
  spellName: string,
  tag: {
    sourceType: SourceType
    sourceName: string
    sourceRef?: string
    grantType: GrantType
    spellGrantedAtLevel?: number
  },
) {
  const baseCharacter = makeCharacterFixture()
  const baseProvenance = baseCharacter.provenance!
  const normKey = normalizeKey(spellName)

  return {
    ...baseProvenance,
    spells: {
      ...baseProvenance.spells,
      [normKey]: [
        {
          sourceType: tag.sourceType,
          sourceName: tag.sourceName,
          sourceRef: tag.sourceRef,
          grantType: tag.grantType,
          spellGrantedAtLevel: tag.spellGrantedAtLevel,
          label: tag.sourceName,
        },
      ],
    },
  }
}
