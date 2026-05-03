import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
import { makeClassFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
}

function resetGameDataStore() {
  useGameDataStore.setState({
    gameData: null,
    dataSourceConfig: null,
    isLoading: false,
    isBackgroundRefreshing: false,
    loadProgress: null,
    error: null,
    lastLoadedAt: null,
    cacheStatus: 'unknown',
    hasHydrated: false,
  })
}

describe('character creation and proficiencies validation', () => {
  beforeEach(() => {
    resetCharacterStore()
    resetGameDataStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('wizard defaults start at minimum scores for non-standard methods', () => {
    expect(INITIAL_CHARACTER_DATA.originSystem).toBe('')
    expect(INITIAL_CHARACTER_DATA.abilityScoreMethod).toBe('point-buy')
    expect(INITIAL_CHARACTER_DATA.abilityScores).toEqual({
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    })
  })

  test('wizard rules validation requires an origin system selection', async () => {
    const { validateStep } = await import('@/components/character/wizard/validation')

    const result = validateStep(
      2,
      {
        ...INITIAL_CHARACTER_DATA,
        originSystem: '',
        allowedSources: ['PHB'],
      },
      undefined,
    )

    expect(result.valid).toBe(false)
    expect(result.fields).toContain('originSystem')
  })

  test('createNewCharacter with class proficiencies produces valid character with string proficiencies', () => {
    // This test validates that the character creation produces proper data structures.
    // It tests the core logic of proficiency handling that was broken in the bug:
    // proficiencies.weapons contained objects instead of strings.

    const testClass: Class5e = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      startingProficiencies: {
        armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
        weapons: ['simple melee weapons', 'martial melee weapons'],
        tools: [],
        skills: ['Athletics', 'Acrobatics'],
      },
      proficiency: ['strength', 'constitution'],
    })

    const testRace: Race5e = makeRaceFixture({
      name: 'Elf',
      source: 'PHB',
      ability: [{ dex: 2, int: 1 }],
    })

    const testBackground: Background5e = {
      name: 'Soldier',
      source: 'PHB',
    }

    useGameDataStore.setState({
      gameData: {
        races: [testRace],
        classes: [testClass],
        backgrounds: [testBackground],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        magicvariants: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      hasHydrated: true,
      isLoading: false,
    })

    // Simulate what the wizard does: create character with proficiencies extracted from class
    const createNewCharacter = useCharacterStore.getState().createNewCharacter

    const character = createNewCharacter({
      name: 'Haldir',
      race: 'Elf',
      raceSource: 'PHB',
      class: 'Fighter',
      classSource: 'PHB',
      background: 'Soldier',
      backgroundSource: 'PHB',
      proficiencies: {
        armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
        weapons: ['simple melee weapons', 'martial melee weapons'],
        tools: [],
        skills: [],
        languages: ['Common'],
        savingThrows: [],
      },
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    })

    // Verify character was created
    expect(character).toBeTruthy()
    expect(character.name).toBe('Haldir')
    expect(character.race).toBe('Elf')
    expect(character.class).toBe('Fighter')
    expect(character.background).toBe('Soldier')

    // Crucial validation: proficiencies must be arrays of strings, not objects
    expect(Array.isArray(character.proficiencies.armor)).toBe(true)
    expect(Array.isArray(character.proficiencies.weapons)).toBe(true)
    expect(Array.isArray(character.proficiencies.languages)).toBe(true)

    // Verify armor proficiencies are strings (the bug would put objects here)
    character.proficiencies.armor.forEach((armor) => {
      expect(typeof armor).toBe('string')
      expect(armor.length).toBeGreaterThan(0)
      expect(armor).not.toMatch(/\{@/)
    })

    // Verify weapons proficiencies are strings (the bug would put objects here)
    character.proficiencies.weapons.forEach((weapon) => {
      expect(typeof weapon).toBe('string')
      expect(weapon.length).toBeGreaterThan(0)
      expect(weapon).not.toMatch(/\{@/)
    })

    // Verify Common language is present
    expect(character.proficiencies.languages).toContain('Common')

    // Verify character passes schema validation
    const addCharacter = useCharacterStore.getState().addCharacter
    expect(() => {
      addCharacter(character)
    }).not.toThrow()

    // Verify persisted character maintains valid structure
    const state = useCharacterStore.getState()
    const persistedChar = state.characters.find((c) => c.id === character.id)
    expect(persistedChar).toBeTruthy()
    if (persistedChar) {
      expect(Array.isArray(persistedChar.proficiencies.weapons)).toBe(true)
      persistedChar.proficiencies.weapons.forEach((w) => {
        expect(typeof w).toBe('string')
      })
    }
  })

  test('rejects character creation with invalid non-string proficiencies', () => {
    // Create a character with invalid proficiencies on purpose
    // The validation should reject this when createNewCharacter calls addCharacter internally
    const createNewCharacter = useCharacterStore.getState().createNewCharacter

    // createNewCharacter should throw when it tries to add invalid data
    expect(() => {
      createNewCharacter({
        name: 'BadCharacter',
        proficiencies: {
          armor: [],
          // @ts-expect-error Testing invalid data
          weapons: [{ name: 'Longsword' }],
          tools: [],
          skills: [],
          languages: ['Common'],
          savingThrows: [],
        },
      })
    }).toThrow(/proficiencies\.weapons/)
  })
})
