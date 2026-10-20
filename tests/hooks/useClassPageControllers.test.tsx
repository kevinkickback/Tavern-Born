import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import {
  collectSubclassFeatures,
  getClassChoiceOptionKey,
  indexSubclassFeatureTargets,
} from '@/lib/character/classChoiceOptions'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { applyFeatGrant } from '@/lib/provenance'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { useSubclassSelectionController } from '@/pages/build/class/hooks/useSubclassSelectionController'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Feat5e, Subclass5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('class page controllers', () => {
  beforeEach(() => {
    const subclasses = [
      {
        name: 'Bladesinger',
        shortName: 'Bladesinger',
        source: 'FRHoF',
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
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      race: 'Human',
      allowedSources: ['PHB', 'FRHOF'],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  test('derive focused spell, ASI, and subclass state', () => {
    const character = useCharacterStore.getState().activeCharacter
    const classEntity = useGameDataStore.getState().gameData?.classes[0]
    const progression = character?.classProgression ?? []
    const classLookup = useGameDataStore.getState().gameData?.lookups?.classesByKey ?? {}
    const { result } = renderHook(() => ({
      spells: useClassSpellChoiceController(classEntity),
      asi: useClassAsiFeatController({
        character,
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        classLookup,
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
    expect(result.current.asi.totalAsi).toBe(1)
    expect(result.current.subclass.subclasses.map((subclass) => subclass.name)).toEqual([
      'Bladesinger',
      'Evocation',
    ])
  })

  test('keeps replacement-only spell levels available', () => {
    const classEntity = makeClassFixture({
      spellcastingAbility: 'cha',
      cantripProgression: [2, 2],
      spellsKnownProgression: [2, 2],
    })

    const { result } = renderHook(() => useClassSpellChoiceController(classEntity))

    expect(result.current.choicesByLevel.get(2)).toMatchObject({
      cantrips: 0,
      spells: 0,
      canSwap: true,
    })
  })

  test('derives level-three spell choices from the 2014 Arcane Trickster subclass', () => {
    const arcaneTrickster = {
      name: 'Arcane Trickster',
      shortName: 'Arcane Trickster',
      source: 'PHB',
      className: 'Rogue',
      classSource: 'PHB',
      spellcastingAbility: 'int',
      casterProgression: '1/3',
      cantripProgression: [0, 0, 2],
      spellsKnownProgression: [0, 0, 3],
    } as Subclass5e
    const rogue = makeClassFixture({
      name: 'Rogue',
      casterProgression: undefined,
      spellcastingAbility: undefined,
      classTableGroups: [],
      subclasses: [arcaneTrickster],
    })
    const wizard = makeClassFixture()

    const { result } = renderHook(() =>
      useClassSpellChoiceController(rogue, arcaneTrickster, [wizard]),
    )

    expect(result.current.choicesByLevel.get(3)).toMatchObject({
      cantrips: 2,
      spells: 3,
      maxSpellLevel: 1,
      canSwap: true,
    })
  })

  test('derives level-three spell choices from the 2014 Eldritch Knight subclass', () => {
    const eldritchKnight = {
      name: 'Eldritch Knight',
      shortName: 'Eldritch Knight',
      source: 'PHB',
      className: 'Fighter',
      classSource: 'PHB',
      spellcastingAbility: 'int',
      casterProgression: '1/3',
      cantripProgression: [0, 0, 2],
      spellsKnownProgression: [0, 0, 3],
    } as Subclass5e
    const fighter = makeClassFixture({
      name: 'Fighter',
      casterProgression: undefined,
      spellcastingAbility: undefined,
      classTableGroups: [],
      subclasses: [eldritchKnight],
    })
    const wizard = makeClassFixture()

    const { result } = renderHook(() =>
      useClassSpellChoiceController(fighter, eldritchKnight, [wizard]),
    )

    expect(result.current.choicesByLevel.get(3)).toMatchObject({
      cantrips: 2,
      spells: 3,
      maxSpellLevel: 1,
      canSwap: true,
    })
  })

  test('adds a later ASI feat without replacing the earlier class feat', () => {
    const classEntity = useGameDataStore.getState().gameData?.classes[0]
    const classLookup = useGameDataStore.getState().gameData?.lookups?.classesByKey ?? {}
    if (!classEntity) throw new Error('Expected Wizard fixture')
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 8 }],
      feats: [
        {
          id: 'alert-phb',
          name: 'Alert',
          source: 'PHB',
          description: '',
          className: 'Wizard',
          classSource: 'PHB',
          classLevel: 4,
        },
      ],
    })
    character.provenance = applyFeatGrant(character.provenance, 'Alert', 'PHB', true)
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const feats: Feat5e[] = [
      { name: 'Alert', source: 'PHB', entries: [] },
      { name: 'Lucky', source: 'PHB', entries: [] },
    ]
    const { result } = renderHook(() =>
      useClassAsiFeatController({
        character: useCharacterStore((state) => state.activeCharacter),
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        classLookup,
        feats,
      }),
    )

    act(() => result.current.setFeatPickerLevel(8))
    act(() => result.current.confirmFeat([feats[1]]))

    expect(useCharacterStore.getState().activeCharacter?.feats).toEqual([
      expect.objectContaining({ name: 'Alert', source: 'PHB', classLevel: 4 }),
      expect.objectContaining({ name: 'Lucky', source: 'PHB', classLevel: 8 }),
    ])
  })

  test('ASI selection and Finish retain an independently configured bonus copy of the same printing', () => {
    const metadata = (
      JSON.parse(readFileSync('tests/fixtures/skilledFeatSources.json', 'utf8')) as Feat5e[]
    ).find((feat) => feat.source === 'PHB')!
    const gameData = { ...useGameDataStore.getState().gameData!, feats: [metadata] }
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
    let character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
    })
    const selected = replaceBonusFeatSelectionsCommand(character, character.provenance, [metadata])
    character = { ...character, ...selected.characterPatch, provenance: selected.provenanceUpdate }
    const bonus = commitFeatOptionsCommand(
      character,
      character.provenance,
      { ...metadata, selectionKind: 'bonus' },
      { skills: ['History'] },
    )
    character = characterPersistenceSchema.parse({
      ...character,
      ...bonus.characterPatch,
      provenance: bonus.provenanceUpdate,
    })
    useCharacterStore.setState({ activeCharacter: character })
    const { result } = renderHook(() =>
      useClassAsiFeatController({
        character: useCharacterStore((state) => state.activeCharacter),
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        classLookup: useGameDataStore.getState().gameData?.lookups?.classesByKey ?? {},
        feats: [metadata],
      }),
    )
    act(() => result.current.setFeatPickerLevel(4))
    act(() => result.current.confirmFeat([metadata]))
    expect(result.current.optionsPendingFeat?.selectionKind).toBe('ordinary')
    act(() =>
      result.current.commitFeatWithOptions(
        result.current.optionsPendingFeat!,
        { skills: ['Arcana'] },
        [],
      ),
    )
    const configured = characterPersistenceSchema.parse(
      useCharacterStore.getState().activeCharacter,
    )
    expect(configured.feats[0].options).toEqual({ skills: ['Arcana'] })
    expect(configured.specialFeats?.[0].options).toEqual({ skills: ['History'] })
    act(() => result.current.clearFeatSelection(4))
    const removed = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(removed.feats).toEqual([])
    expect(removed.proficiencies.skills).toEqual(['history'])
    expect(removed.specialFeats?.[0].options).toEqual({ skills: ['History'] })
  })

  test.each([
    [
      { name: 'Skilled', source: 'PHB' },
      { name: 'Skilled', source: 'XPHB' },
    ],
    [
      { name: 'Training|HB', source: 'One' },
      { name: 'Training', source: 'HB|One' },
    ],
  ])('recognizes another complete feat printing as a new configurable ASI selection: %j', (first, second) => {
    const classEntity = useGameDataStore.getState().gameData?.classes[0]
    const classLookup = useGameDataStore.getState().gameData?.lookups?.classesByKey ?? {}
    if (!classEntity) throw new Error('Expected Wizard fixture')
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 8 }],
      feats: [
        {
          id: 'skilled-phb',
          ...first,
          description: '',
          className: 'Wizard',
          classSource: 'PHB',
          classLevel: 4,
        },
      ],
    })
    character.provenance = applyFeatGrant(character.provenance, first.name, first.source, true)
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const configurableFeat = {
      ...second,
      entries: [],
      skillProficiencies: [{ choose: { count: 1, from: ['Arcana'] } }],
    } satisfies Feat5e
    const { result } = renderHook(() =>
      useClassAsiFeatController({
        character: useCharacterStore((state) => state.activeCharacter),
        viewingClass: 'Wizard',
        viewingClassSource: 'PHB',
        classLookup,
        feats: [configurableFeat],
      }),
    )

    act(() => result.current.setFeatPickerLevel(8))
    expect(result.current.featModalFeats).toContainEqual(configurableFeat)
    act(() => result.current.confirmFeat([configurableFeat]))

    expect(useCharacterStore.getState().activeCharacter?.feats).toEqual([
      expect.objectContaining({ ...first, classLevel: 4 }),
      expect.objectContaining({ ...second, classLevel: 8 }),
    ])
    expect(result.current.optionsPendingFeat).toMatchObject(second)
  })

  test('adds a later-level spell choice without replacing earlier class-profile spells', () => {
    const current = useCharacterStore.getState().activeCharacter
    const classEntity = useGameDataStore.getState().gameData?.classes[0]
    if (!current || !classEntity) throw new Error('Expected Wizard fixtures')
    const character = makeCharacterFixture({
      ...current,
      spells: {
        ...current.spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 4)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
            spellsKnown: [
              'Detect Magic',
              'Feather Fall',
              'Mage Armor',
              'Magic Missile',
              'Shield',
              'Sleep',
            ],
            preparedSpells: ['Mage Armor', 'Magic Missile', 'Shield', 'Sleep'],
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
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(() => useClassSpellChoiceController(classEntity))
    act(() => {
      result.current.setClassSpellSelectionsAtLevel('Wizard', 'PHB', 2, [
        { name: 'Arcane Lock', spellLevel: 2 },
        { name: 'Misty Step', spellLevel: 2 },
      ])
    })

    const profile = useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find(
        (candidate) => candidate.id === 'class:Wizard|PHB',
      )
    expect(profile?.cantrips).toEqual(['Fire Bolt', 'Mage Hand', 'Prestidigitation'])
    expect(profile?.spellsKnown).toEqual(
      expect.arrayContaining([
        'Detect Magic',
        'Feather Fall',
        'Mage Armor',
        'Magic Missile',
        'Shield',
        'Sleep',
        'Arcane Lock',
        'Misty Step',
      ]),
    )
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.spells['arcane lock']?.[0],
    ).toMatchObject({ sourceRef: 'PHB', spellGrantedAtLevel: 2 })
  })

  test('does not inherit the primary subclass when viewing another class', () => {
    const character = makeCharacterFixture({
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
      options: [
        {
          entityType: 'classFeature' as const,
          name: 'Practical Study',
          source: 'PHB',
          ref: 'Practical Study|Wizard|PHB|1|PHB',
        },
      ],
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
        {
          name: 'Practical Study',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 1,
          entries: ['Choose practical training.'],
        },
      ],
      subclassFeatures: [],
      creatures: [],
      feats: [],
      items: [],
      itemsBase: [],
      itemMasteries: [],
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
    expect(useCharacterStore.getState().activeCharacter?.features).toEqual([
      expect.objectContaining({ name: 'Practical Study', source: 'PHB', level: 1 }),
    ])
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.features['practical study'],
    ).toEqual([
      expect.objectContaining({
        sourceType: 'class',
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        grantVariant: normalizedChoice.id,
      }),
    ])
  })

  test('preserves a retained unavailable class option until it is replaced', () => {
    const normalizedChoice = {
      id: 'class:wizard|phb|choice:study|1',
      label: 'Field of Study',
      kind: 'class-feature' as const,
      owner: { type: 'class' as const, name: 'Wizard', source: 'PHB' },
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array(20).fill(1),
      options: [
        {
          entityType: 'classFeature' as const,
          name: 'Current Study',
          source: 'PHB',
          ref: 'Current Study|Wizard||1',
        },
      ],
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
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      classChoiceSelections: [
        {
          choiceId: normalizedChoice.id,
          label: normalizedChoice.label,
          kind: normalizedChoice.kind,
          className: 'Wizard',
          classSource: 'PHB',
          classLevel: 1,
          selected: [
            {
              entityType: 'classFeature',
              name: 'Archived Study',
              source: 'OLD',
              ref: 'Archived Study|Wizard||1|OLD',
              slotLevel: 1,
            },
          ],
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    const { result } = renderHook(() =>
      useClassChoiceController({
        character,
        viewingClassData: classEntity,
        viewingClassLevel: 4,
        catalogs: {
          classFeatures: [
            {
              name: 'Current Study',
              source: 'PHB',
              className: 'Wizard',
              classSource: 'PHB',
              level: 1,
              entries: [],
            },
          ],
          subclassFeatures: [],
          creatures: [],
          feats: [],
          items: [],
          itemsBase: [],
          itemMasteries: [],
          optionalFeatures: [],
        },
      }),
    )

    act(() => result.current.open(normalizedChoice))
    const retained = result.current.activeOptionViews.find(
      (option) => option.reference.name === 'Archived Study',
    )
    expect(retained?.availability).toBe('retained')
    expect(result.current.activeInitialSelectedIds).toEqual([
      getClassChoiceOptionKey(character.classChoiceSelections![0].selected[0]),
    ])

    act(() => result.current.confirm(retained ? [retained] : []))
    expect(
      useCharacterStore.getState().activeCharacter?.classChoiceSelections?.[0]?.selected,
    ).toEqual([expect.objectContaining({ name: 'Archived Study', source: 'OLD' })])

    act(() => result.current.open(normalizedChoice))
    act(() => result.current.confirm(result.current.activeOptionViews))
    expect(
      useCharacterStore.getState().activeCharacter?.classChoiceSelections?.[0]?.selected,
    ).toEqual([expect.objectContaining({ name: 'Current Study', source: 'PHB' })])
  })
  test('a class choice picker keeps competing full subclass owners unresolved', () => {
    const classes = parseClasses({
      class: [{ name: 'Wizard', source: 'PHB', classFeatures: ['Training|Wizard||3'] }],
      classFeature: [
        {
          name: 'Training',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          level: 3,
          entries: [
            {
              type: 'options',
              count: 1,
              entries: [
                { type: 'refSubclassFeature', subclassFeature: 'Beacon|Wizard||School||3' },
              ],
            },
          ],
        },
      ],
      subclass: [
        {
          name: 'First School',
          shortName: 'School',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassFeatures: ['Beacon|Wizard||School||3'],
        },
      ],
      subclassFeature: [
        {
          name: 'Beacon',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassShortName: 'School',
          subclassSource: 'PHB',
          level: 3,
          entries: ['As an action, light a beacon.'],
        },
      ],
    }) as Class5e[]
    const first = classes[0].subclasses![0]
    const choice = classes[0].normalizedRules!.choices[0]
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3, subclass: first.name, subclassSource: 'PHB' },
      ],
    })
    const catalogs = (allClasses: Class5e[]) => ({
      classFeatures: [],
      // The page's viewing subclass is only a subset of the composed catalog.
      subclassFeatures: collectSubclassFeatures(first),
      subclassTargets: indexSubclassFeatureTargets(allClasses),
      creatures: [],
      feats: [],
      items: [],
      itemsBase: [],
      itemMasteries: [],
      optionalFeatures: [],
    })
    const { result, rerender } = renderHook(
      ({ allClasses }) =>
        useClassChoiceController({
          character,
          viewingClassData: classes[0],
          viewingSubclassData: first,
          viewingClassLevel: 3,
          catalogs: catalogs(allClasses),
        }),
      { initialProps: { allClasses: classes } },
    )
    act(() => result.current.open(choice))
    expect(result.current.activeOptionViews).toMatchObject([
      { availability: 'eligible', entries: ['As an action, light a beacon.'] },
    ])
    const competing = structuredClone(classes)
    competing[0].subclasses!.push({ ...structuredClone(first), name: 'Second School' })
    for (const reverse of [false, true]) {
      if (reverse) competing[0].subclasses!.reverse()
      rerender({ allClasses: competing })
      expect(result.current.activeOptionViews).toMatchObject([
        { availability: 'retained', entries: [] },
      ])
    }
    rerender({ allClasses: classes })
    expect(result.current.activeOptionViews).toMatchObject([
      { availability: 'eligible', entries: ['As an action, light a beacon.'] },
    ])
  })
})
