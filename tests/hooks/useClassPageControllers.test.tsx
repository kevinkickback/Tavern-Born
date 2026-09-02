import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassOptionalFeatureController } from '@/pages/build/class/hooks/useClassOptionalFeatureController'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { useSubclassSelectionController } from '@/pages/build/class/hooks/useSubclassSelectionController'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Subclass5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('class page controllers', () => {
  beforeEach(() => {
    const subclasses = [
      {
        name: 'Bladesinger',
        shortName: 'Bladesinger',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
      },
      {
        name: 'Evocation',
        shortName: 'Evocation',
        source: 'PHB',
        className: 'Wizard',
        classSource: 'PHB',
      },
    ] as Subclass5e[]
    const wizard = makeClassFixture({
      subclasses,
      spellcastingAbility: 'int',
      cantripProgression: [3, 3, 3, 4],
      spellsKnownProgression: [6, 8, 10, 12],
    })
    const gameData = makeGameDataFixture({
      classes: [wizard],
      optionalfeatures: [{ name: 'Arcane Option', source: 'PHB', featureType: ['EI'] }],
    })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })

    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      level: 4,
      race: 'Human',
      allowedSources: ['PHB'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  test('derive focused spell, optional-feature, ASI, and subclass state', () => {
    const character = useCharacterStore.getState().activeCharacter
    const classEntity = useGameDataStore.getState().gameData?.classes[0]
    const progression = character?.classProgression ?? []
    const classLookup = useGameDataStore.getState().gameData?.lookups?.classesByKey ?? {}
    const fallbackClassByName = new Map(classEntity ? [[classEntity.name, classEntity]] : [])
    const { result } = renderHook(() => ({
      spells: useClassSpellChoiceController(classEntity),
      optional: useClassOptionalFeatureController({
        character,
        viewingClass: 'Wizard',
        viewingClassData: classEntity,
        optionalFeatures: useGameDataStore.getState().gameData?.optionalfeatures ?? [],
        includeClassFeatureVariants: false,
      }),
      asi: useClassAsiFeatController({
        character,
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        classLookup,
        fallbackClassByName,
        feats: [],
      }),
      subclass: useSubclassSelectionController({
        character,
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        viewingClassData: classEntity,
        viewingEntry: progression[0],
        classProgression: progression,
        onSelectionApplied: vi.fn(),
      }),
    }))

    expect(result.current.spells.choicesByLevel.size).toBeGreaterThan(0)
    expect(result.current.optional.features.map((feature) => feature.name)).toEqual([
      'Arcane Option',
    ])
    expect(result.current.asi.totalAsi).toBe(1)
    expect(result.current.subclass.subclasses.map((subclass) => subclass.name)).toEqual([
      'Evocation',
    ])
  })
})
