import type { DataSourceConfig } from '@/types/5etools'
import type { PreparedCatalog } from './catalogCandidate'

export interface CatalogComparisonBasis {
  config: DataSourceConfig | null
  externalKeys?: string[]
  hasExternalData: boolean
}

export function compareCatalog(candidate: PreparedCatalog, prior: CatalogComparisonBasis) {
  const source = prior.config
  if (!source || source.type === 'bundled')
    return { additions: [], removals: [], incompleteRemovalPreview: false, sameExternalKeys: false }

  const previousResources = new Set(source.availableResources)
  const resources = new Set(candidate.config.availableResources)
  const additions = source.availableResources
    ? [...resources].filter((file) => !previousResources.has(file))
    : []
  const removals = [...previousResources].filter((file) => !resources.has(file))
  if (prior.externalKeys) {
    const keys = new Set(candidate.keys)
    const previousKeys = new Set(prior.externalKeys)
    additions.push(...candidate.keys.filter((key) => !previousKeys.has(key)))
    removals.push(...prior.externalKeys.filter((key) => !keys.has(key)))
  }
  return {
    additions,
    removals,
    incompleteRemovalPreview: prior.hasExternalData && !prior.externalKeys,
    sameExternalKeys: removals.length === 0 && prior.externalKeys?.length === candidate.keys.length,
  }
}
