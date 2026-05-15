const KEY_PREFIX = 'tb:hint-dismissed:'

function storageKey(hintId: string): string {
  return `${KEY_PREFIX}${hintId}`
}

export function isHintDismissed(hintId: string): boolean {
  try {
    return localStorage.getItem(storageKey(hintId)) === 'true'
  } catch {
    return false
  }
}

export function setHintDismissed(hintId: string, dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(storageKey(hintId), 'true')
      return
    }
    localStorage.removeItem(storageKey(hintId))
  } catch {}
}

export function resetAllHints(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(KEY_PREFIX)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch {}
}
