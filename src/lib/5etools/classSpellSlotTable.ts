/** Match the production parser's first table and row filtering, including an empty table. */
export function getParsedClassSpellSlotProgression(value: unknown): number[][] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const groups = (value as Record<string, unknown>).classTableGroups
  if (!Array.isArray(groups)) return undefined
  for (const group of groups) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue
    const rows = (group as Record<string, unknown>).rowsSpellProgression
    if (Array.isArray(rows)) return rows.filter(Array.isArray) as number[][]
  }
  return undefined
}
