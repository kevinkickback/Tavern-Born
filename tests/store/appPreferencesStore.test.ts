import { beforeEach, describe, expect, test, vi } from 'vitest'

const { setThemePreferencesMock } = vi.hoisted(() => ({
  setThemePreferencesMock: vi.fn(),
}))

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

vi.mock('@/lib/themeManager', () => ({
  ACCENT_THEMES: ['blue', 'violet', 'green', 'orange'],
  APPEARANCE_THEMES: ['light', 'dark'],
  getStoredAccentTheme: () => 'blue',
  getStoredAppearanceTheme: () => 'light',
  setThemePreferences: setThemePreferencesMock,
  setAccentTheme: vi.fn(),
  setAppearanceTheme: vi.fn(),
}))

import {
  DEFAULT_HOME_CARD_SIZE,
  MAX_HOME_CARD_SIZE,
  MIN_HOME_CARD_SIZE,
  useAppPreferencesStore,
} from '@/store/appPreferencesStore'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('appPreferencesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppPreferencesStore.setState({
      homeCardSize: DEFAULT_HOME_CARD_SIZE,
      themeAccent: 'blue',
      themeAppearance: 'light',
      autoRefreshGameData: true,
    })
    useCharacterStore.setState({
      characters: [],
      activeCharacterId: null,
      activeCharacter: null,
    })
  })

  test('setHomeCardSize clamps to configured bounds', () => {
    useAppPreferencesStore.getState().setHomeCardSize(MAX_HOME_CARD_SIZE + 100)
    expect(useAppPreferencesStore.getState().homeCardSize).toBe(MAX_HOME_CARD_SIZE)

    useAppPreferencesStore.getState().setHomeCardSize(MIN_HOME_CARD_SIZE - 100)
    expect(useAppPreferencesStore.getState().homeCardSize).toBe(MIN_HOME_CARD_SIZE)
  })

  test('theme setters update persisted preferences', () => {
    useAppPreferencesStore.getState().setThemeAccent('green')
    useAppPreferencesStore.getState().setThemeAppearance('dark')

    const state = useAppPreferencesStore.getState()
    expect(state.themeAccent).toBe('green')
    expect(state.themeAppearance).toBe('dark')
  })

  test('settings changes do not create character unsaved state', () => {
    const character = makeCharacterFixture({ id: 'hero-1', name: 'Hero' })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    useAppPreferencesStore.getState().setHomeCardSize(520)
    useAppPreferencesStore.getState().setAutoRefreshGameData(false)

    expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  })

  test('persist partialize stores only app preference fields', () => {
    const storeWithPersist = useAppPreferencesStore as unknown as {
      persist: {
        getOptions: () => {
          partialize: (
            state: ReturnType<typeof useAppPreferencesStore.getState>,
          ) => Record<string, unknown>
        }
      }
    }

    const partialize = storeWithPersist.persist.getOptions().partialize
    const partialized = partialize(useAppPreferencesStore.getState())

    expect(partialized).toEqual({
      homeCardSize: DEFAULT_HOME_CARD_SIZE,
      themeAccent: 'blue',
      themeAppearance: 'light',
      autoRefreshGameData: true,
      autoUpdate: true,
      uiScale: 100,
    })
  })

  test('persist rehydrate sanitizes values and reapplies theme', () => {
    const storeWithPersist = useAppPreferencesStore as unknown as {
      persist: {
        getOptions: () => {
          onRehydrateStorage?: () =>
            | ((state?: {
                homeCardSize: number
                themeAccent: string
                themeAppearance: string
                autoRefreshGameData: boolean
              }) => void)
            | undefined
        }
      }
    }

    const onRehydrate = storeWithPersist.persist.getOptions().onRehydrateStorage?.()

    const rehydrateState = {
      homeCardSize: 999,
      themeAccent: 'invalid',
      themeAppearance: 'invalid',
      autoRefreshGameData: false,
    }

    onRehydrate?.(rehydrateState)

    expect(rehydrateState.homeCardSize).toBe(MAX_HOME_CARD_SIZE)
    expect(rehydrateState.themeAccent).toBe('blue')
    expect(rehydrateState.themeAppearance).toBe('dark')
  })
})
