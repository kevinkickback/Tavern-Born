import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

const { validateDataSourceMock } = vi.hoisted(() => ({
  validateDataSourceMock: vi.fn(),
}))

vi.mock('@/lib/5etools', async () => {
  const actual = await vi.importActual<typeof import('@/lib/5etools')>('@/lib/5etools')
  return { ...actual, validateDataSource: validateDataSourceMock }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

describe('data source switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateDataSourceMock.mockResolvedValue({
      isValid: true,
      normalizedPath: 'https://raw.githubusercontent.com/example/rules/main/data',
      foundResources: ['class/index.json'],
    })
    useGameDataStore.setState({
      gameData: null,
      dataSourceConfig: null,
      isLoading: false,
      isBackgroundRefreshing: false,
      loadProgress: null,
      error: null,
      lastLoadedAt: null,
      lastDataChangedAt: null,
      lastContentFingerprint: null,
      lastUpdateCheckAt: null,
      cacheStatus: 'unknown',
      hasHydrated: true,
    })
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
      isActiveCharacterDirty: false,
      unsupportedCharacters: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  test('adds external content without rewriting character identities', async () => {
    const user = userEvent.setup()
    const bundledData = makeGameDataFixture({
      classes: [
        makeClassFixture({ name: 'Wizard', source: 'PHB' }),
        makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
      ],
    })
    const layeredData = makeGameDataFixture({
      classes: [
        makeClassFixture({ name: 'Wizard', source: 'PHB' }),
        makeClassFixture({ name: 'Wizard', source: 'XPHB' }),
        makeClassFixture({ name: 'Artificer', source: 'TCE' }),
      ],
    })
    const bundledConfig: DataSourceConfig = {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    }
    const character = makeCharacterFixture({
      id: 'source-switch-character',
      race: 'Human',
      raceSource: 'PHB',
      background: 'Soldier',
      backgroundSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
    })
    const loadGameData = vi.fn((config: DataSourceConfig) => {
      useGameDataStore.setState({
        gameData: layeredData,
        dataSourceConfig: { ...config, isValid: true },
        error: null,
        cacheStatus: 'fetched',
      })
      return Promise.resolve(true)
    })
    useGameDataStore.setState({
      gameData: bundledData,
      dataSourceConfig: bundledConfig,
      cacheStatus: 'fetched',
      loadGameData,
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<DataSourceConfigurator />)
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Web Address' }),
      'https://github.com/example/rules',
    )
    await waitFor(() => expect(validateDataSourceMock).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))

    await waitFor(() => expect(screen.getByText('Online Additional Content')).toBeTruthy())
    const gameDataState = useGameDataStore.getState()
    expect(gameDataState.gameData).toBe(layeredData)
    expect(gameDataState.gameData?.classes.map(({ name, source }) => `${name}|${source}`)).toEqual([
      'Wizard|PHB',
      'Wizard|XPHB',
      'Artificer|TCE',
    ])
    expect(loadGameData).toHaveBeenCalledWith({
      type: 'remote',
      path: 'https://raw.githubusercontent.com/example/rules/main/data',
      isValid: true,
      availableResources: ['class/index.json'],
    })

    const characterState = useCharacterStore.getState()
    expect(characterState.characters).toEqual([character])
    expect(characterState.activeCharacter).toEqual(character)
    expect(characterState.isActiveCharacterDirty).toBe(false)
  })
})
