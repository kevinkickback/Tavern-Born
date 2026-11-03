import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

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
