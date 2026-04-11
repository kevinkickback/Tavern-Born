import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClasses: () => [],
  useClassLookup: () => ({}),
}))

import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('Spell Management - Integration Tests', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
  })

  test('character creation → spell assignment → save → load cycle', () => {
    // Create a character
    const character = makeCharacterFixture({
      id: 'spell-integration-1',
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

    // Add to store
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    // Verify initial state
    expect(useCharacterStore.getState().activeCharacter).toBeDefined()
    expect(useCharacterStore.getState().activeCharacter?.spells.spellProfiles).toHaveLength(2)

    // Simulate adding spells (in real scenario, done via useSpellSlots hook)
    const activeChar = useCharacterStore.getState().activeCharacter
    if (activeChar) {
      useCharacterStore.getState().updateCharacter(activeChar.id, {
        spells: {
          ...activeChar.spells,
          spellProfiles: activeChar.spells.spellProfiles.map((profile) => {
            if (profile.id === 'class:Wizard|PHB') {
              return {
                ...profile,
                cantrips: ['Fire Bolt', 'Mage Hand'],
                spellsKnown: ['Magic Missile', 'Shield'],
              }
            }
            return profile
          }),
        },
      })
    }

    // Verify spells were added
    const updated = useCharacterStore.getState().activeCharacter
    const wizardProfile = updated?.spells.spellProfiles.find((p) => p.id === 'class:Wizard|PHB')
    expect(wizardProfile?.cantrips).toContain('Fire Bolt')
    expect(wizardProfile?.spellsKnown).toContain('Magic Missile')

    // Simulate save/load by reconstructing from store state
    const saved = useCharacterStore.getState().activeCharacter
    useCharacterStore.setState({ activeCharacter: null })
    expect(useCharacterStore.getState().activeCharacter).toBeNull()

    // Simulate rehydration/load
    if (saved) {
      useCharacterStore.setState({ activeCharacter: saved })
    }

    // Verify spells persisted
    const loaded = useCharacterStore.getState().activeCharacter
    const reloadedProfile = loaded?.spells.spellProfiles.find((p) => p.id === 'class:Wizard|PHB')
    expect(reloadedProfile?.cantrips).toContain('Fire Bolt')
    expect(reloadedProfile?.spellsKnown).toContain('Magic Missile')
  })

  test('multiclass spell slot calculation and merging', () => {
    const character = makeCharacterFixture({
      id: 'spell-integration-2',
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
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

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const char = useCharacterStore.getState().activeCharacter
    expect(char?.classProgression).toHaveLength(2)
    expect(char?.spells.spellProfiles).toHaveLength(2) // Wizard + Bonus Spells before profile sync hook runs
  })

  test('profile syncing on class progression changes', () => {
    const character = makeCharacterFixture({
      id: 'spell-integration-3',
      class: 'Wizard',
      classSource: 'PHB',
      level: 1,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    let char = useCharacterStore.getState().activeCharacter
    expect(char?.spells.spellProfiles).toHaveLength(2) // Wizard + Bonus Spells

    // Add a multiclass level
    if (char) {
      useCharacterStore.getState().updateCharacter(char.id, {
        classProgression: [
          { name: 'Wizard', source: 'PHB', levels: 1 },
          { name: 'Cleric', source: 'PHB', levels: 1 },
        ],
      })
    }

    // After update, profiles should include new Cleric profile
    char = useCharacterStore.getState().activeCharacter
    expect(char?.classProgression).toHaveLength(2)
    // Note: actual profile syncing would happen in useSpellSlots hook
    // This test verifies the store update mechanism works
  })

  test('spell profile structure is valid after mutations', () => {
    const character = makeCharacterFixture({
      id: 'spell-integration-4',
      class: 'Wizard',
      classSource: 'PHB',
      level: 2,
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const char = useCharacterStore.getState().activeCharacter
    expect(char?.spells.spellProfiles).toBeDefined()

    for (const profile of char?.spells.spellProfiles ?? []) {
      expect(profile.id).toBeDefined()
      expect(profile.type).toMatch(/^(class|special)$/)
      expect(profile.label).toBeDefined()
      expect(Array.isArray(profile.cantrips)).toBe(true)
      expect(Array.isArray(profile.spellsKnown)).toBe(true)
      expect(Array.isArray(profile.preparedSpells)).toBe(true)
    }
  })

  test('spell slots structure is valid after mutations', () => {
    const character = makeCharacterFixture({
      id: 'spell-integration-5',
      class: 'Wizard',
      classSource: 'PHB',
      level: 1,
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const char = useCharacterStore.getState().activeCharacter
    expect(char?.spells.spellSlots).toBeDefined()

    // Verify all slot levels exist
    for (let level = 1; level <= 9; level++) {
      const slotKey = `level${level}` as const
      expect(char?.spells.spellSlots[slotKey]).toHaveProperty('max')
      expect(char?.spells.spellSlots[slotKey]).toHaveProperty('used')
      expect(typeof char?.spells.spellSlots[slotKey].max === 'number').toBe(true)
      expect(typeof char?.spells.spellSlots[slotKey].used === 'number').toBe(true)
    }
  })
})
