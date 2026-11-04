/** Sort visible labels while leaving catalog order available for draft defaults. */
export function sortCreatorOptions<T extends { name: string; source?: string }>(
  entries: readonly T[],
  label: (entry: T) => string = (entry) => entry.name,
): T[] {
  return [...entries].sort(
    (a, b) => label(a).localeCompare(label(b)) || (a.source ?? '').localeCompare(b.source ?? ''),
  )
}
