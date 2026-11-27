export class CatalogCheckError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message)
  }
}

export function describeCatalogReference(reference: string) {
  const [name, source, ...qualifiers] = reference.split('|')
  return source && !qualifiers.length ? `${name} (${source})` : reference
}

export function catalogWarningsForDisplay(candidate?: {
  warnings: string[]
  dependencyWarnings?: string[]
}) {
  return [...(candidate?.dependencyWarnings ?? []), ...(candidate?.warnings ?? [])]
}
