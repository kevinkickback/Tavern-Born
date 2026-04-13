import { act, renderHook } from '@testing-library/react'
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
  useRaces: () => [],
}))

import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
}

function makeWizardCharacter() {
  return makeCharacterFixture({
    id: 'spell-hook-char',
    class: 'Wizard',
    classSource: 'PHB',
    level: 2,
    classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
    spells: {
      spellProfiles: [
        {
          id: 'class:Wizard|PHB',
          type: 'class',
          label: 'Wizard (Lv 2)',
          className: 'Wizard',
          classSource: 'PHB',
          cantrips: ['Fire Bolt'],
          spellsKnown: ['Magic Missile'],
          preparedSpells: ['Magic Missile'],
          alwaysPrepared: false,
        },
        {
          id: 'special:unrestricted',
          type: 'special',
          label: 'Bonus Spells',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ],
      spellSlots: makeCharacterFixture().spells.spellSlots,
    },
  })
}

describe('useSpellSlots hook', () => {
  beforeEach(() => {
    resetCharacterStore()
  })

  test('add/remove known spells and prepared toggles mutate class profile', () => {
    const character = makeCharacterFixture({
      id: 'spell-hook-2',
      class: 'Wizard',
      classSource: 'PHB',
      level: 2,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 2)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Magic Missile'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: 'special:unrestricted',
            type: 'special',
            label: 'Bonus Spells',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: {
          1: { max: 2, used: 0 },
          2: { max: 0, used: 0 },
          3: { max: 0, used: 0 },
          4: { max: 0, used: 0 },
          5: { max: 0, used: 0 },
          6: { max: 0, used: 0 },
          7: { max: 0, used: 0 },
          8: { max: 0, used: 0 },
          9: { max: 0, used: 0 },
        },
      },
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.addSpellKnown('Shield', 'class:Wizard|PHB')
    })
    act(() => {
      result.current.togglePrepared('class:Wizard|PHB', 'Shield')
    })
    act(() => {
      result.current.removeSpellKnown('Magic Missile', 'class:Wizard|PHB')
    })

    const classProfile =
      useCharacterStore
        .getState()
        .activeCharacter?.spells.spellProfiles.find(
          (profile) => profile.id === 'class:Wizard|PHB',
        ) ?? null

    expect(classProfile?.spellsKnown).toContain('Shield')
    expect(classProfile?.spellsKnown).not.toContain('Magic Missile')
    expect(classProfile?.preparedSpells).toContain('Shield')
  })

  test('addCantrip with default profile uses first class profile', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.addCantrip('Light')
    })

    const classProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')

    expect(classProfile?.cantrips).toContain('Light')
  })

  test('addCantrip with explicit profile ID uses that profile', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.addCantrip('Guidance', 'special:unrestricted')
    })

    const specialProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find(
        (profile) => profile.id === 'special:unrestricted',
      )

    expect(specialProfile?.cantrips).toContain('Guidance')
  })

  test('removeCantrip removes cantrip from profile and prepared spells', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: {
        ...character,
        spells: {
          ...character.spells,
          spellProfiles: character.spells.spellProfiles.map((profile) =>
            profile.id === 'class:Wizard|PHB'
              ? {
                  ...profile,
                  cantrips: ['Fire Bolt', 'Light'],
                  preparedSpells: ['Fire Bolt'],
                }
              : profile,
          ),
        },
      },
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.removeCantrip('Fire Bolt', 'class:Wizard|PHB')
    })

    const classProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')

    expect(classProfile?.cantrips).not.toContain('Fire Bolt')
    expect(classProfile?.preparedSpells).not.toContain('Fire Bolt')
  })

  test('setProfileSpells replaces all spells for a profile', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.setProfileSpells('class:Wizard|PHB', ['Mage Hand'], ['Shield'])
    })

    const classProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')

    expect(classProfile?.cantrips).toEqual(['Mage Hand'])
    expect(classProfile?.spellsKnown).toEqual(['Shield'])
  })

  test('syncProfiles rebuilds profiles from class progression', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: {
        ...character,
        classProgression: [
          { name: 'Wizard', source: 'PHB', levels: 1 },
          { name: 'Cleric', source: 'PHB', levels: 1 },
        ],
      },
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.syncProfiles()
    })

    const profileIds =
      useCharacterStore
        .getState()
        .activeCharacter?.spells.spellProfiles.map((profile) => profile.id) ?? []

    expect(profileIds).toContain('class:Cleric|PHB')
    expect(profileIds).toContain('special:unrestricted')
  })

  test('togglePrepared adds/removes spell from prepared list', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.togglePrepared('class:Wizard|PHB', 'Shield')
    })
    act(() => {
      result.current.togglePrepared('class:Wizard|PHB', 'Shield')
    })

    const classProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')

    expect(classProfile?.preparedSpells).not.toContain('Shield')
  })

  test('removeSpellKnown removes spell from spellsKnown and prepared', () => {
    const character = makeWizardCharacter()
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useSpellSlots())

    act(() => {
      result.current.removeSpellKnown('Magic Missile', 'class:Wizard|PHB')
    })

    const classProfile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')

    expect(classProfile?.spellsKnown).not.toContain('Magic Missile')
    expect(classProfile?.preparedSpells).not.toContain('Magic Missile')
  })
})
