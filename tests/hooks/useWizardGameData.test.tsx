import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

describe('useWizardGameData', () => {
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
})
