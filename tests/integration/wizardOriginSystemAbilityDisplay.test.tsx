import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { AbilityScoresStep } from '@/components/character/wizard/steps/6-AbilityScoresStep'
import { ReviewStep } from '@/components/character/wizard/steps/7-ReviewStep'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

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

describe('wizard 2024 origin-system ability display', () => {
  beforeEach(() => {
    resetGameDataStore()

    const race: Race5e = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dexterity: 2 }],
    }

    useGameDataStore.setState({
      gameData: {
        races: [race],
        classes: [],
        backgrounds: [],
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
        sources: [],
      },
      hasHydrated: true,
      isLoading: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  test('ability scores step hides racial bonus UI and totals for 2024 rules', () => {
    render(
      <AbilityScoresStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          originSystem: '2024',
          race: 'Elf',
          raceSource: 'PHB',
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        }}
        onChange={() => undefined}
      />,
    )

    expect(screen.queryByText('Racial Bonuses')).toBeNull()
    expect(screen.queryByText('10+2')).toBeNull()
  })

  test('review step does not include racial ASI totals for 2024 rules', () => {
    render(
      <ReviewStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          name: 'Aelar',
          originSystem: '2024',
          race: 'Elf',
          raceSource: 'PHB',
          class: 'Wizard',
          background: 'Sage',
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        }}
      />,
    )

    expect(screen.queryByText('10+2')).toBeNull()
  })
})
