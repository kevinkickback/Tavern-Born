import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
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
        source: 'SCAG',
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

  test('does not inherit the primary subclass when viewing another class', () => {
    const character = makeCharacterFixture({
      class: 'Sorcerer',
      classSource: 'PHB',
      subclass: 'Shadow Magic',
      subclassSource: 'XGE',
      classProgression: [
        {
          name: 'Sorcerer',
          source: 'PHB',
          levels: 3,
          subclass: 'Shadow Magic',
          subclassSource: 'XGE',
        },
        { name: 'Warlock', source: 'PHB', levels: 1 },
      ],
      level: 4,
    })
    const warlock = makeClassFixture({
      name: 'Warlock',
      source: 'PHB',
      subclasses: [
        {
          name: 'The Fiend',
          shortName: 'Fiend',
          source: 'PHB',
          className: 'Warlock',
          classSource: 'PHB',
        },
      ],
    })
    const gameData = makeGameDataFixture({ classes: [warlock] })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })

    const { result } = renderHook(() =>
      useSubclassSelectionController({
        character,
        viewingClass: 'Warlock',
        viewingClassSource: 'PHB',
        viewingClassData: warlock,
        viewingEntry: character.classProgression?.[1],
        classProgression: character.classProgression ?? [],
        onSelectionApplied: vi.fn(),
      }),
    )

    expect(result.current.viewingSubclass).toBeUndefined()
    expect(result.current.viewingSubclassData).toBeUndefined()
  })

  test('persists a source-qualified normalized class choice through the store', () => {
    const character = useCharacterStore.getState().activeCharacter
    if (!character) throw new Error('Expected active character fixture')
    const normalizedChoice = {
      id: 'class:wizard|phb|choice:study|1',
      label: 'Field of Study',
      kind: 'class-feature' as const,
      owner: { type: 'class' as const, name: 'Wizard', source: 'PHB' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [{ entityType: 'classFeature' as const, name: 'Practical Study', source: 'PHB' }],
      repeatable: false,
      replacement: { cadence: 'never' as const },
      source: { kind: 'class-feature-options' as const, field: 'fixture' },
    }
    const classEntity = makeClassFixture({
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [normalizedChoice],
        choiceDiagnostics: [],
      },
    })
    const catalogs = {
      classFeatures: [
        { name: 'Practical Study', source: 'PHB', entries: ['Choose practical training.'] },
      ],
      feats: [],
      items: [],
      optionalFeatures: [],
    }
    const { result } = renderHook(() =>
      useClassChoiceController({
        character,
        viewingClassData: classEntity,
        viewingClassLevel: 4,
        catalogs,
      }),
    )

    act(() => result.current.open(normalizedChoice))
    expect(result.current.activeOptionViews[0]?.reference.name).toBe('Practical Study')
    act(() => result.current.confirm(result.current.activeOptionViews))

    expect(useCharacterStore.getState().activeCharacter?.classChoiceSelections?.[0]).toMatchObject({
      choiceId: normalizedChoice.id,
      className: 'Wizard',
      classSource: 'PHB',
      selected: [{ name: 'Practical Study', source: 'PHB', slotLevel: 1 }],
    })
  })
})
