const KEY_PREFIX = 'tb:hint-dismissed:'

function storageKey(hintId: string): string {
  return `${KEY_PREFIX}${hintId}`
}

/** Read whether a one-time UI hint has been dismissed by the user. */
export function isHintDismissed(hintId: string): boolean {
  try {
    return localStorage.getItem(storageKey(hintId)) === 'true'
  } catch {
    return false
  }
}

/** Persist one-time UI hint dismissal state. */
export function setHintDismissed(hintId: string, dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(storageKey(hintId), 'true')
      return
    }
    localStorage.removeItem(storageKey(hintId))
  } catch {
    // localStorage unavailable (SSR, private browsing restriction) — noop
  }
}

/** Remove all dismissed one-time UI hint records, causing them to appear again. */
export function resetAllHints(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(KEY_PREFIX)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
  } catch {
    // localStorage unavailable — noop
  }
}
