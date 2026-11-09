import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DataSourceConfigurator } from '@/components/settings/DataSourceConfigurator'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { DataSourceConfig } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture, makeGameDataFixture } from '../fixtures/gameDataFixtures'

const { prepareCatalogMock } = vi.hoisted(() => ({
  prepareCatalogMock: vi.fn(),
}))

vi.mock(import('@/lib/5etools/catalogCandidate'), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareCatalog: prepareCatalogMock,
}))

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

  test('ignores and releases a folder selected after switching away from the local tab', async () => {
    const user = userEvent.setup()
    let choose!: (value: string) => void
    const selectFolder = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          choose = resolve
        }),
    )
    const discardLocalDataRoot = vi.fn()
    vi.stubGlobal('electronAPI', { selectFolder, discardLocalDataRoot })
    render(<DataSourceConfigurator selectorOnly />)
    await user.click(screen.getByRole('tab', { name: 'This Computer' }))
    await user.click(screen.getByRole('button', { name: 'Select Folder' }))
    await user.click(screen.getByRole('tab', { name: 'Online' }))
    await act(async () => choose('/unused'))
    expect((screen.getByRole('textbox', { name: 'Web Address' }) as HTMLInputElement).value).toBe(
      '',
    )
    expect(prepareCatalogMock).not.toHaveBeenCalled()
    expect(discardLocalDataRoot).toHaveBeenCalledWith('/unused')
  })

  test.each([
    { type: 'local', path: 'C:/Rules/5etools', tab: 'This Computer', field: 'Folder' },
    {
      type: 'remote',
      path: 'https://backup.example.test/rules',
      tab: 'Online',
      field: 'Web Address',
    },
  ] as const)('prefills the saved $type source when changing additional content', async ({
    type,
    path,
    tab,
    field,
  }) => {
    const user = userEvent.setup()
    const config = { type, path, isValid: true }
    useGameDataStore.setState({ dataSourceConfig: config, gameData: makeGameDataFixture() })
    render(<DataSourceConfigurator />)

    const change = () =>
      user.click(screen.getByRole('button', { name: 'Change Additional Content' }))
    const input = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
    await change()
    expect(screen.getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true')
    expect(input(field).value).toBe(path)
    expect(
      (screen.getByRole('button', { name: 'Add Additional Content' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await user.click(
      screen.getByRole('tab', { name: type === 'local' ? 'Online' : 'This Computer' }),
    )
    expect(input(type === 'local' ? 'Web Address' : 'Folder').value).toBe('')
    await user.click(screen.getByRole('tab', { name: tab }))
    expect(input(field).value).toBe(path)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await change()
    expect(input(field).value).toBe(path)
    expect(prepareCatalogMock).not.toHaveBeenCalled()
    expect(useGameDataStore.getState().dataSourceConfig).toBe(config)
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
    const preparedConfig = {
      type: 'remote' as const,
      path: 'https://backup.example.test/rules',
      isValid: true,
      availableResources: ['class/index.json'],
    }
    const candidate = {
      config: preparedConfig,
      identity: { base: bundledConfig, additional: preparedConfig },
      data: layeredData,
      keys: [],
      warnings: [],
    }
    prepareCatalogMock.mockResolvedValue(candidate)
    const loadCatalog = vi.fn((config: DataSourceConfig) => {
      useGameDataStore.setState({
        gameData: layeredData,
        dataSourceConfig: { ...config, isValid: true },
        error: null,
        cacheStatus: 'fetched',
      })
      return Promise.resolve({ kind: 'applied' as const, changed: true })
    })
    useGameDataStore.setState({
      gameData: bundledData,
      dataSourceConfig: bundledConfig,
      cacheStatus: 'fetched',
      loadCatalog,
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    render(<DataSourceConfigurator />)
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))
    await user.click(screen.getByRole('tab', { name: 'This Computer' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))
    expect(screen.getByRole('tab', { name: 'This Computer' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    await user.click(screen.getByRole('tab', { name: 'Online' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Web Address' }),
      'https://backup.example.test/rules',
    )
    await waitFor(() => expect(prepareCatalogMock).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Add Additional Content' }))

    await waitFor(() => expect(screen.getByText('Online Additional Content')).toBeTruthy())
    const gameDataState = useGameDataStore.getState()
    expect(gameDataState.gameData).toBe(layeredData)
    expect(gameDataState.gameData?.classes.map(({ name, source }) => `${name}|${source}`)).toEqual([
      'Wizard|PHB',
      'Wizard|XPHB',
      'Artificer|TCE',
    ])
    expect(loadCatalog).toHaveBeenCalledWith(preparedConfig, false, {
      prepared: candidate,
      confirmed: false,
    })

    const characterState = useCharacterStore.getState()
    expect(characterState.characters).toEqual([character])
    expect(characterState.activeCharacter).toEqual(character)
    expect(characterState.isActiveCharacterDirty).toBe(false)
  })
})
