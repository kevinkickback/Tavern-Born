import type { Class5e, Subclass5e } from '@/types/5etools'

export class CatalogCheckError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message)
  }
}

export interface CatalogDependencyOwner {
  parent: Pick<Class5e, 'name' | 'source'>
  subclass?: Pick<Subclass5e, 'name' | 'source' | 'shortName'>
}

export interface CatalogDependencyFailure extends CatalogDependencyOwner {
  reference: string
  explanation?: string
}

export class CatalogDependencyError extends CatalogCheckError {
  constructor(
    message: string,
    details: string[],
    readonly failures: CatalogDependencyFailure[],
  ) {
    super(message, details)
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
