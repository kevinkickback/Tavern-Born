import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createIdbStorage } from '@/lib/storage/idb-storage';
import {
  ACCENT_THEMES,
  type AccentTheme,
  APPEARANCE_THEMES,
  type AppearanceTheme,
  setAccentTheme as applyAccentTheme,
  setAppearanceTheme as applyAppearanceTheme,
  getStoredAccentTheme,
  getStoredAppearanceTheme,
  setThemePreferences,
} from '@/lib/themeManager';

export const MIN_HOME_CARD_SIZE = 360;
export const MAX_HOME_CARD_SIZE = 560;
export const DEFAULT_HOME_CARD_SIZE = MIN_HOME_CARD_SIZE;

function clampHomeCardSize(size: number): number {
  return Math.min(MAX_HOME_CARD_SIZE, Math.max(MIN_HOME_CARD_SIZE, size));
}

function normalizeAccentTheme(value: string): AccentTheme {
  return (ACCENT_THEMES as readonly string[]).includes(value)
    ? (value as AccentTheme)
    : 'blue';
}

function normalizeAppearanceTheme(value: string): AppearanceTheme {
  return (APPEARANCE_THEMES as readonly string[]).includes(value)
    ? (value as AppearanceTheme)
    : 'light';
}

interface AppPreferencesState {
  homeCardSize: number;
  themeAccent: AccentTheme;
  themeAppearance: AppearanceTheme;
  autoRefreshGameData: boolean;
  setHomeCardSize: (size: number) => void;
  setThemeAccent: (accent: AccentTheme) => void;
  setThemeAppearance: (appearance: AppearanceTheme) => void;
  setAutoRefreshGameData: (enabled: boolean) => void;
}

export const useAppPreferencesStore = create<AppPreferencesState>()(
  persist(
    (set) => ({
      homeCardSize: DEFAULT_HOME_CARD_SIZE,
      themeAccent: getStoredAccentTheme(),
      themeAppearance: getStoredAppearanceTheme(),
      autoRefreshGameData: true,

      setHomeCardSize: (size) => set({ homeCardSize: clampHomeCardSize(size) }),

      setThemeAccent: (accent) => {
        applyAccentTheme(accent);
        set({ themeAccent: accent });
      },

      setThemeAppearance: (appearance) => {
        applyAppearanceTheme(appearance);
        set({ themeAppearance: appearance });
      },

      setAutoRefreshGameData: (enabled) =>
        set({ autoRefreshGameData: enabled }),
    }),
    {
      name: 'app-preferences-storage',
      storage: createIdbStorage(),
      partialize: (state) => ({
        homeCardSize: state.homeCardSize,
        themeAccent: state.themeAccent,
        themeAppearance: state.themeAppearance,
        autoRefreshGameData: state.autoRefreshGameData,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.homeCardSize = clampHomeCardSize(state.homeCardSize);
        state.themeAccent = normalizeAccentTheme(state.themeAccent);
        state.themeAppearance = normalizeAppearanceTheme(state.themeAppearance);
        state.autoRefreshGameData = state.autoRefreshGameData !== false;

        setThemePreferences(state.themeAccent, state.themeAppearance);
      },
    },
  ),
);
