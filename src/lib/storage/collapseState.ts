const KEY_PREFIX = 'tb:accordion:'

function storageKey(sectionId: string): string {
  return `${KEY_PREFIX}${sectionId}`
}

export function getCollapseState(sectionId: string, defaultCollapsed = true): boolean {
  try {
    const raw = localStorage.getItem(storageKey(sectionId))
    if (raw === null) return defaultCollapsed
    return raw === 'true'
  } catch {
    return defaultCollapsed
  }
}

export function setCollapseState(sectionId: string, collapsed: boolean): void {
  try {
    localStorage.setItem(storageKey(sectionId), String(collapsed))
  } catch {}
}
