const ACCENT_STORAGE_KEY = 'tb.theme.accent';
const APPEARANCE_STORAGE_KEY = 'tb.theme.appearance';

export const ACCENT_THEMES = ['blue', 'violet', 'green', 'orange'] as const;
export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const APPEARANCE_THEMES = ['light', 'dark'] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

const isAccentTheme = (value: string): value is AccentTheme => {
  return (ACCENT_THEMES as readonly string[]).includes(value);
};

const isAppearanceTheme = (value: string): value is AppearanceTheme => {
  return (APPEARANCE_THEMES as readonly string[]).includes(value);
};

export function getStoredAccentTheme(): AccentTheme {
  try {
    const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY);
    return storedAccent && isAccentTheme(storedAccent) ? storedAccent : 'blue';
  } catch {
    return 'blue';
  }
}

export function getStoredAppearanceTheme(): AppearanceTheme {
  try {
    const storedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return storedAppearance && isAppearanceTheme(storedAppearance)
      ? storedAppearance
      : 'light';
  } catch {
    return 'light';
  }
}

export function applyThemeRootAttributes(
  root: HTMLElement,
  accent: AccentTheme,
  appearance: AppearanceTheme,
) {
  root.setAttribute('data-accent', accent);
  root.setAttribute('data-appearance', appearance);
}

export function initThemeFromStorage() {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  applyThemeRootAttributes(
    root,
    getStoredAccentTheme(),
    getStoredAppearanceTheme(),
  );
}

export function setThemePreferences(
  accent: AccentTheme,
  appearance: AppearanceTheme,
) {
  const root = document.getElementById('root');
  if (root) {
    applyThemeRootAttributes(root, accent, appearance);
  }

  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // localStorage unavailable — noop
  }
}

export function setAccentTheme(accent: AccentTheme) {
  setThemePreferences(accent, getStoredAppearanceTheme());
}

export function setAppearanceTheme(appearance: AppearanceTheme) {
  setThemePreferences(getStoredAccentTheme(), appearance);
}
