interface ClassReference {
  name?: string
  source?: string
}

/** Match the complete selected class printing without changing its saved spelling or IDs. */
export function findClassReference<T extends ClassReference>(
  reference: ClassReference,
  classes: Iterable<T | undefined> = [],
): T | undefined {
  const name = reference.name?.trim().toLowerCase()
  const source = reference.source?.trim().toLowerCase()
  if (!name || !source) return undefined
  for (const candidate of classes) {
    if (
      candidate?.name?.trim().toLowerCase() === name &&
      candidate.source?.trim().toLowerCase() === source
    )
      return candidate
  }
  return undefined
}
