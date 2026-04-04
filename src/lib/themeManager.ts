const ACCENT_STORAGE_KEY = 'tb.theme.accent'
const APPEARANCE_STORAGE_KEY = 'tb.theme.appearance'

export const ACCENT_THEMES = ['blue', 'violet', 'green', 'orange'] as const
export type AccentTheme = (typeof ACCENT_THEMES)[number]

export const APPEARANCE_THEMES = ['light', 'dark'] as const
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number]

const isAccentTheme = (value: string): value is AccentTheme => {
  return (ACCENT_THEMES as readonly string[]).includes(value)
}

const isAppearanceTheme = (value: string): value is AppearanceTheme => {
  return (APPEARANCE_THEMES as readonly string[]).includes(value)
}

export function applyThemeRootAttributes(root: HTMLElement, accent: AccentTheme, appearance: AppearanceTheme) {
  root.setAttribute('data-accent', accent)
  root.setAttribute('data-appearance', appearance)
}

export function initThemeFromStorage() {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  const storedAccent = localStorage.getItem(ACCENT_STORAGE_KEY)
  const storedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY)

  const accent: AccentTheme = storedAccent && isAccentTheme(storedAccent) ? storedAccent : 'blue'
  const appearance: AppearanceTheme = storedAppearance && isAppearanceTheme(storedAppearance) ? storedAppearance : 'light'

  applyThemeRootAttributes(root, accent, appearance)
}

export function setAccentTheme(accent: AccentTheme) {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  root.setAttribute('data-accent', accent)
  localStorage.setItem(ACCENT_STORAGE_KEY, accent)
}

export function setAppearanceTheme(appearance: AppearanceTheme) {
  const root = document.getElementById('root')
  if (!root) {
    return
  }

  root.setAttribute('data-appearance', appearance)
  localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance)
}
