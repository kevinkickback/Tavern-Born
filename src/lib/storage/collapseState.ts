const KEY_PREFIX = 'tb:accordion:'

function storageKey(sectionId: string): string {
  return `${KEY_PREFIX}${sectionId}`
}

/** Read the collapsed state for a section (defaults to the given fallback). */
export function getCollapseState(sectionId: string, defaultCollapsed = true): boolean {
  try {
    const raw = localStorage.getItem(storageKey(sectionId))
    if (raw === null) return defaultCollapsed
    return raw === 'true'
  } catch {
    return defaultCollapsed
  }
}

/** Persist the collapsed state change for a section. */
export function setCollapseState(sectionId: string, collapsed: boolean): void {
  try {
    localStorage.setItem(storageKey(sectionId), String(collapsed))
  } catch {
    // localStorage unavailable (SSR, private browsing restriction) — noop
  }
}
