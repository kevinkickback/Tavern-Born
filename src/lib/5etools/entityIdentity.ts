/** Pure name/printing key; independent of catalog construction and calculation modules. */
export function getEntityLookupKey(name?: unknown, source?: unknown): string {
  const safeName = typeof name === 'string' ? name.trim() : ''
  const safeSource = typeof source === 'string' ? source.trim() : ''
  return `${safeName}|${safeSource}`
}
