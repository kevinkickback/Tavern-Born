import type { DataSourceConfig, GameData } from '@/types/5etools'
import type { PreparedCatalog } from './catalogCandidate'
import { externalCatalogKeys } from './contentLayers'

export interface CatalogComparisonBasis {
  config: DataSourceConfig | null
  externalKeys?: string[]
  fallbackData?: GameData
  hasExternalData: boolean
}

export function compareCatalog(candidate: PreparedCatalog, prior: CatalogComparisonBasis) {
  const source = prior.config
  if (!source || source.type === 'bundled')
    return { removals: [], incompleteRemovalPreview: false, sameExternalKeys: false }

  const resources = new Set(candidate.config.availableResources)
  const removals = (source.availableResources ?? []).filter(
    (file) => !file.startsWith('fluff-') && file !== 'book/book-tce.json' && !resources.has(file),
  )
  if (prior.externalKeys) {
    const keys = new Set(candidate.keys)
    removals.push(...prior.externalKeys.filter((key) => !keys.has(key)))
  } else if (prior.fallbackData) {
    const keys = new Set(externalCatalogKeys(candidate.data))
    removals.push(...externalCatalogKeys(prior.fallbackData).filter((key) => !keys.has(key)))
  }
  return {
    removals,
    incompleteRemovalPreview: prior.hasExternalData && !prior.externalKeys,
    sameExternalKeys: removals.length === 0 && prior.externalKeys?.length === candidate.keys.length,
  }
}
