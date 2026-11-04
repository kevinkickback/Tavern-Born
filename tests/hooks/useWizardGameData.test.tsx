import { readFileSync } from 'node:fs'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { getCurrentClassProficiencyChoices } from '@/lib/5etools/classProficiencyChoices'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  getCharacterClassChoiceDiagnostics,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature, Item5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'
import rogueLanguageSources from '../fixtures/rogueLanguageSources.json'

describe('useWizardGameData', () => {
  test('creation retains only declared raw dependencies while ordinary wizard items remain filtered', () => {
    const cls = makeClassFixture({
      name: 'Artificer',
      source: 'TCE',
      startingEquipment: { defaultData: [{ _: ['Dagger|PHB'] }] },
    })
    const data = makeGameDataFixture({
      classes: [cls],
      itemsBase: parseItems({
        baseitem: [
          { name: 'Dagger', source: 'PHB', type: 'M', weaponCategory: 'simple' },
          { name: 'Dagger', source: 'XPHB', type: 'M|XPHB', weaponCategory: 'simple' },
        ],
      }) as Item5e[],
    })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    const { result } = renderHook(() =>
      useWizardGameData({ originSystem: '2024', allowedSources: ['TCE'] }),
    )
    expect(result.current.itemsBase.some((item) => item.source === 'PHB')).toBe(false)
    const created = buildInitialCharacter(
      {
        initial: {
          name: 'Creation dependency probe',
          originSystem: '2024',
          allowedSources: ['TCE'],
        },
        classEntity: cls,
      },
      result.current.itemLookup,
      () => [],
      result.current.creationLookups,
    )
    const reopened = characterPersistenceSchema.parse(created)
    expect(reopened.initialClass).toEqual({ name: 'Artificer', source: 'TCE' })
    expect(reopened.equipment).toEqual([
      expect.objectContaining({ name: 'Dagger', source: 'PHB', quantity: 1 }),
    ])
  })
  beforeEach(() => {
    const oldRace = {
      name: 'Aasimar',
      source: 'MPMM',
      reprintedAs: ['Aasimar|XPHB'],
    } as Race5e
    const newRace = { name: 'Aasimar', source: 'XPHB' } as Race5e
    const gameData = makeGameDataFixture({
      races: [oldRace, newRace],
      classes: [makeClassFixture({ name: 'Fighter', source: 'PHB' })],
    })
    gameData.lookups = buildGameDataLookups(gameData)
    useGameDataStore.setState({ gameData })
  })

  test.each([
    ['2014', 'PHB'],
    ['2024', 'XPHB'],
  ] as const)('Rogue %s creation saves Cant and exposes the edition-specific language setup', (originSystem, source) => {
    const raw = JSON.parse(readFileSync('resources/srd/core/data/class/class-rogue.json', 'utf8'))
    const parsed = parseClassDocument({
      class: rogueLanguageSources.class,
      classFeature: raw.classFeature.filter(
        (feature: ClassFeature) => feature.name === "Thieves' Cant",
      ),
    })
    const data = makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      languages: JSON.parse(readFileSync('resources/srd/core/data/languages.json', 'utf8'))
        .language,
    })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    const { result } = renderHook(() =>
      useWizardGameData({ originSystem, allowedSources: [source] }),
    )
    const { classes, itemLookup, creationLookups } = result.current
    const cls = classes.find((entry) => entry.source === source)!
    const cant = "thieves' cant"
    const character = characterPersistenceSchema.parse(
      buildInitialCharacter(
        {
          initial: { name: 'Rogue language probe', originSystem, allowedSources: [source] },
          classEntity: cls,
        },
        itemLookup,
        () => [],
        creationLookups,
      ),
    )
    expect(character.proficiencies.languages).toEqual([cant])
    expect(character.provenance.proficiencies.languages[cant]).toEqual([
      expect.objectContaining({ sourceType: 'class', sourceRef: source, grantType: 'fixed' }),
    ])
    const catalogs = creationLookups.classChoiceFeatureCatalogs
    const choices = getCurrentClassProficiencyChoices(cls, false, catalogs)
    if (source === 'PHB') {
      expect(choices).toEqual([])
      return
    }
    expect(choices).toEqual([
      expect.objectContaining({
        proficiencyDomain: 'languages',
        minimumSelections: 1,
        maximumSelections: 1,
      }),
    ])
    const [choice] = choices
    const apply = (name: string) =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [getProficiencyOption('languages', name)],
        { classes, catalogs },
      )
    expect(() => apply(cant)).toThrow()
    const picked = apply('Undercommon')
    const saved = characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...character,
          ...picked.characterPatch,
          provenance: picked.provenanceUpdate,
        }),
      ),
    )
    expect(saved.proficiencies.languages).toEqual([cant, 'undercommon'])
    const missing = { ...catalogs, classFeatureCandidates: new Map() }
    const dormant = refreshClassProficiencyState(saved, classes, missing)
    expect(dormant.proficiencies.languages).toEqual([])
    expect(dormant.classChoiceSelections).toHaveLength(1)
    expect(
      refreshClassProficiencyState(dormant, classes, catalogs).proficiencies.languages,
    ).toEqual([cant, 'undercommon'])

    const shared = {
      ...saved,
      provenance: addGrant(
        saved.provenance,
        'languages',
        cant,
        makeSourceTag('manual', 'User Choice', 'choice'),
      ),
    }
    expect(refreshClassProficiencyState(shared, classes, missing).proficiencies.languages).toEqual([
      cant,
    ])

    const missingParsed = parseClassDocument({
      class: [{ name: 'Rogue', source, classFeatures: [] }],
      classFeature: raw.classFeature,
    })
    const [missingClass] = missingParsed.classes as Class5e[]
    const missingDeclaration = buildClassChoiceFeatureCatalogs({ ...data, classes: [missingClass] })
    expect(
      getCharacterClassChoiceDiagnostics(
        missingClass,
        undefined,
        createOptionalClassFeatureActivity(character, missingDeclaration),
        missingDeclaration,
      ),
    ).toContainEqual(
      expect.objectContaining({ code: 'unverified-required-choice', featureName: "Thieves' Cant" }),
    )
  })

  test('applies draft sources and shared reprint suppression', () => {
    const { result } = renderHook(() =>
      useWizardGameData({
        allowedSources: ['MPMM', 'XPHB'],
        originSystem: '2024',
        preferNewerPrintings: true,
      }),
    )

    expect(result.current.races.map((race) => `${race.name}|${race.source}`)).toEqual([
      'Aasimar|XPHB',
    ])
  })

  test('includes the ruleset source and resolves filtered-primary with raw fallback', () => {
    const { result } = renderHook(() =>
      useWizardGameData({
        allowedSources: ['XPHB'],
        originSystem: '2014',
        preferNewerPrintings: true,
      }),
    )

    expect(result.current.classes.map((classEntity) => classEntity.source)).toContain('PHB')
    expect(result.current.resolveRace({ name: 'Aasimar', source: 'MPMM' }).parentRace?.source).toBe(
      'MPMM',
    )
  })

  test('treats an empty source selection as the ruleset source only', () => {
    const { result } = renderHook(() =>
      useWizardGameData({
        allowedSources: [],
        originSystem: '2014',
      }),
    )

    expect(result.current.classes.map((classEntity) => classEntity.source)).toEqual(['PHB'])
    expect(result.current.races).toEqual([])
  })
})
