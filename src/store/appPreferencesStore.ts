import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createIdbStorage } from '@/lib/storage/idb-storage'
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
  getStoredAccentTheme,
  getStoredAppearanceTheme,
  setThemePreferences,
} from '@/lib/themeManager'

export const UI_SCALE_OPTIONS = [80, 90, 100, 110, 120] as const
export type UiScale = (typeof UI_SCALE_OPTIONS)[number]
export const DEFAULT_UI_SCALE: UiScale = 100

export function applyUiScale(scale: UiScale) {
  document.documentElement.style.fontSize = `${scale}%`
}

export const MIN_HOME_CARD_SIZE = 360
export const MAX_HOME_CARD_SIZE = 560
export const DEFAULT_HOME_CARD_SIZE = MIN_HOME_CARD_SIZE

function clampHomeCardSize(size: number): number {
  return Math.min(MAX_HOME_CARD_SIZE, Math.max(MIN_HOME_CARD_SIZE, size))
}

function normalizeAccentTheme(value: string): AccentTheme {
  return (ACCENT_THEMES as readonly string[]).includes(value) ? (value as AccentTheme) : 'blue'
}

function normalizeAppearanceTheme(value: string): AppearanceTheme {
  return (APPEARANCE_THEMES as readonly string[]).includes(value)
    ? (value as AppearanceTheme)
    : 'light'
}

interface AppPreferencesState {
  homeCardSize: number
  themeAccent: AccentTheme
  themeAppearance: AppearanceTheme
  autoRefreshGameData: boolean
  uiScale: UiScale
  sidebarOpen: boolean
  setHomeCardSize: (size: number) => void
  setThemeAccent: (accent: AccentTheme) => void
  setThemeAppearance: (appearance: AppearanceTheme) => void
  setAutoRefreshGameData: (enabled: boolean) => void
  setUiScale: (scale: UiScale) => void
  setSidebarOpen: (open: boolean) => void
}

export const useAppPreferencesStore = create<AppPreferencesState>()(
  persist(
    (set) => ({
      homeCardSize: DEFAULT_HOME_CARD_SIZE,
      themeAccent: getStoredAccentTheme(),
      themeAppearance: getStoredAppearanceTheme(),
      autoRefreshGameData: true,
      uiScale: DEFAULT_UI_SCALE,
      sidebarOpen: false,

      setHomeCardSize: (size) => set({ homeCardSize: clampHomeCardSize(size) }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setUiScale: (scale) => set({ uiScale: scale }),

      setThemeAccent: (accent) => set({ themeAccent: accent }),

      setThemeAppearance: (appearance) => set({ themeAppearance: appearance }),

      setAutoRefreshGameData: (enabled) => set({ autoRefreshGameData: enabled }),
    }),
    {
      name: 'app-preferences-storage',
      storage: createIdbStorage(),
      partialize: (state) => ({
        homeCardSize: state.homeCardSize,
        themeAccent: state.themeAccent,
        themeAppearance: state.themeAppearance,
        autoRefreshGameData: state.autoRefreshGameData,
        uiScale: state.uiScale,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return
        }

        state.homeCardSize = clampHomeCardSize(state.homeCardSize)
        state.themeAccent = normalizeAccentTheme(state.themeAccent)
        state.themeAppearance = normalizeAppearanceTheme(state.themeAppearance)
        state.autoRefreshGameData = state.autoRefreshGameData !== false
        const validScales: number[] = [...UI_SCALE_OPTIONS]
        state.uiScale = validScales.includes(state.uiScale) ? state.uiScale : DEFAULT_UI_SCALE

        setThemePreferences(state.themeAccent, state.themeAppearance)
        applyUiScale(state.uiScale)
      },
    },
  ),
)
