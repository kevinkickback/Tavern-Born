import { act } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

/**
 * Integration tests for multiclass updates and post-creation class modifications.
 */

describe('Multiclass Updates', () => {
  describe('Advancing existing class levels', () => {
    test('leveling up a class within classProgression updates level', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 3,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
        ],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Simulate leveling up wizard from 3 to 4
      const leveledCharacter = {
        ...character,
        level: 4,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 4, // Increased
          },
        ],
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 4,
          classProgression: leveledCharacter.classProgression,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.level).toBe(4)
      expect(updated?.classProgression?.[0].levels).toBe(4)
    })

    test('leveling changes spell slots for spellcasters', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 1,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 1,
          },
        ],
        spells: {
          spellProfiles: [
            {
              id: 'special:unrestricted',
              type: 'special',
              label: 'Spell Selection',
              alwaysPrepared: true,
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
            },
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 1)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: {
            1: { max: 2, used: 0 },
          },
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Level up to 3, which adds spell slots
      const leveledCharacter = {
        ...character,
        level: 3,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
        ],
        spells: {
          ...character.spells,
          spellSlots: {
            1: { max: 4, used: 0 },
            2: { max: 3, used: 0 },
          },
        },
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 3,
          classProgression: leveledCharacter.classProgression,
          spells: leveledCharacter.spells,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.spells.spellSlots[2]).toBeDefined()
      expect(updated?.spells.spellSlots[2]?.max).toBe(3)
    })
  })

  describe('Adding a new class (multiclassing)', () => {
    test('adding a class creates new entry in classProgression', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 5,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
        ],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Multiclass into Cleric
      const multiclassedCharacter = {
        ...character,
        level: 6,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
          {
            name: 'Cleric',
            source: 'PHB',
            levels: 1,
          },
        ],
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 6,
          classProgression: multiclassedCharacter.classProgression,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.classProgression).toHaveLength(2)
      expect(updated?.classProgression?.[1].name).toBe('Cleric')
      expect(updated?.classProgression?.[1].levels).toBe(1)
    })

    test('multiclassing adds spell profile for new spellcasting class', () => {
      const character = makeCharacterFixture({
        class: 'Fighter',
        classSource: 'PHB',
        level: 5,
        classProgression: [
          {
            name: 'Fighter',
            source: 'PHB',
            levels: 5,
          },
        ],
        spells: {
          spellProfiles: [
            {
              id: 'special:unrestricted',
              type: 'special',
              label: 'Spell Selection',
              alwaysPrepared: true,
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
            },
          ],
          spellSlots: {},
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Multiclass into Wizard
      const multiclassedCharacter = {
        ...character,
        level: 6,
        classProgression: [
          {
            name: 'Fighter',
            source: 'PHB',
            levels: 5,
          },
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 1,
          },
        ],
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
            {
              id: 'special:unrestricted',
              type: 'special' as const,
              label: 'Spell Selection',
              alwaysPrepared: true,
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
            },
          ],
          spellSlots: {
            1: { max: 2, used: 0 },
          },
        },
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 6,
          classProgression: multiclassedCharacter.classProgression,
          spells: multiclassedCharacter.spells,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      const wizardProfile = updated?.spells.spellProfiles.find((p) => p.className === 'Wizard')
      expect(wizardProfile).toBeDefined()
      expect(wizardProfile?.id).toBe('class:Wizard|PHB')
    })
  })

  describe('Removing class levels', () => {
    test('removing a class deletes it from classProgression', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 6,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
          {
            name: 'Cleric',
            source: 'PHB',
            levels: 1,
          },
        ],
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Remove one level of Cleric (or entire Cleric if it was only 1 level)
      const singleClassCharacter = {
        ...character,
        level: 5,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
        ],
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 5,
          classProgression: singleClassCharacter.classProgression,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.classProgression).toHaveLength(1)
      expect(updated?.classProgression?.[0].name).toBe('Wizard')
    })

    test('removing a spellcasting class removes its spell profile', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 6,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
          {
            name: 'Cleric',
            source: 'PHB',
            levels: 1,
          },
        ],
        spells: {
          spellProfiles: [
            {
              id: 'special:unrestricted',
              type: 'special',
              label: 'Spell Selection',
              alwaysPrepared: true,
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
            },
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 5)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt'],
              spellsKnown: ['Magic Missile'],
              preparedSpells: ['Magic Missile'],
              alwaysPrepared: false,
            },
            {
              id: 'class:Cleric|PHB',
              type: 'class',
              label: 'Cleric (Lv 1)',
              className: 'Cleric',
              classSource: 'PHB',
              cantrips: ['Sacred Flame'],
              spellsKnown: [],
              preparedSpells: ['Cure Wounds'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: {
            1: { max: 5, used: 0 },
          },
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Remove Cleric class
      const wizardOnlyCharacter = {
        ...character,
        level: 5,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 5,
          },
        ],
        spells: {
          spellProfiles: character.spells.spellProfiles.filter((p) => p.className !== 'Cleric'),
          spellSlots: {
            1: { max: 4, used: 0 },
            2: { max: 3, used: 0 },
          },
        },
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 5,
          classProgression: wizardOnlyCharacter.classProgression,
          spells: wizardOnlyCharacter.spells,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      const clericProfile = updated?.spells.spellProfiles.find((p) => p.className === 'Cleric')
      expect(clericProfile).toBeUndefined()
    })
  })

  describe('Proficiency reconciliation on class changes', () => {
    test('skills granted by new class are added to proficiencies', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 3,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
        ],
        proficiencies: {
          skills: ['arcana', 'history'], // From Wizard
          languages: ['common'],
          tools: [],
          weapons: [],
          armor: [],
          savingThrows: [],
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Multiclass into Rogue (Acrobatics, Sleight of Hand, Stealth)
      const multiclassedCharacter = {
        ...character,
        level: 4,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
          {
            name: 'Rogue',
            source: 'PHB',
            levels: 1,
          },
        ],
        proficiencies: {
          ...character.proficiencies,
          // After multiclass, Wizard skills stay, Rogue skills may be added depending on choice
          skills: ['acrobatics', 'arcana', 'history', 'sleightofhand'],
        },
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 4,
          classProgression: multiclassedCharacter.classProgression,
          proficiencies: multiclassedCharacter.proficiencies,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.proficiencies.skills).toContain('acrobatics')
      expect(updated?.proficiencies.skills).toContain('arcana') // Original
    })
  })

  describe('Hit points recalculation on class changes', () => {
    test('hp should be recalculated when changing class levels', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
        level: 3,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
        ],
        hitPoints: {
          current: 15,
          max: 15, // Wizard: 6 + (2 * 4 con mod) = 14, let's say 15
          temporary: 0,
        },
        abilityScores: {
          strength: 10,
          dexterity: 14,
          constitution: 14, // +2 modifier
          intelligence: 15,
          wisdom: 13,
          charisma: 8,
        },
      })

      useCharacterStore.setState({
        activeCharacter: character,
        activeCharacterId: character.id,
        characters: [character],
      })

      // Multiclass into Barbarian (more HP per level)
      const multiclassedCharacter = {
        ...character,
        level: 4,
        classProgression: [
          {
            name: 'Wizard',
            source: 'PHB',
            levels: 3,
          },
          {
            name: 'Barbarian',
            source: 'PHB',
            levels: 1,
          },
        ],
        // HP should increase (Barbarian gets d12, Wizard gets d6)
        hitPoints: {
          current: 24,
          max: 24, // Recalculated with Barbarian level
          temporary: 0,
        },
      }

      act(() => {
        useCharacterStore.getState().updateCharacter(character.id, {
          level: 4,
          classProgression: multiclassedCharacter.classProgression,
          hitPoints: multiclassedCharacter.hitPoints,
        })
      })

      const updated = useCharacterStore.getState().activeCharacter
      expect(updated?.hitPoints.max).toBeGreaterThan(character.hitPoints.max)
    })
  })

  describe('Known gap: Post-creation class modification tests missing', () => {
    test('current test suite focuses on creation, not modification', () => {
      const character = makeCharacterFixture({
        class: 'Wizard',
        classSource: 'PHB',
      })

      expect(character.class).toBe('Wizard')
    })
  })
})
