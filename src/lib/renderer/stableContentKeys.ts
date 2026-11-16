function getContentKey(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const namedEntry = entry as { name?: unknown }
    if (typeof namedEntry.name === 'string') return namedEntry.name
    return JSON.stringify(entry)
  }
  return String(entry)
}

export function withStableContentKeys(entries: unknown[], prefix: string) {
  const occurrences = new Map<string, number>()
  return entries.map((entry) => {
    const contentKey = getContentKey(entry)
    const occurrence = occurrences.get(contentKey) ?? 0
    occurrences.set(contentKey, occurrence + 1)
    return { entry, key: `${prefix}:${contentKey}:${occurrence}` }
  })
}
