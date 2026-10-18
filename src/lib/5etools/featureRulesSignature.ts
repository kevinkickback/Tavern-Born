/** Source bodies, rather than attached enrichment or object key order, distinguish producers. */
export function featureOptionRulesSignature(entries: unknown[]): string | undefined {
  try {
    return JSON.stringify(entries, (key, value: unknown) => {
      if (key === 'feature' || key === 'featureOptionSourceConflict') return undefined
      const object =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : undefined
      return object
        ? Object.fromEntries(
            Object.keys(object)
              .sort()
              .map((name) => [name, object[name]]),
          )
        : value
    })
  } catch {
    return undefined
  }
}
