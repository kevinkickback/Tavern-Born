import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import type { Feat5e } from '@/types/5etools'

/** Keep saved exact selections available for confirmation when their catalog is missing. */
export function buildFeatModalFeats<T extends { name: string; source?: string }>({
  availableFeats,
  selectedFeats,
  createFallback,
}: {
  availableFeats: T[]
  selectedFeats: Array<{ name: string; source?: string }>
  createFallback: (selected: { name: string; source?: string }) => T
}): T[] {
  const availableIds = new Set(availableFeats.map(getFeatSelectionKey))
  const selectedNotInList = selectedFeats
    .filter((feat) => !availableIds.has(getFeatSelectionKey(feat)))
    .map(createFallback)
  return [...availableFeats, ...selectedNotInList]
}

export interface FeatChoicePoolResolution {
  eligibleFeats: Feat5e[]
  initialFilters?: Record<string, Set<string>>
}

export function resolveFeatChoicePool(
  feats: Feat5e[],
  optionPool: string[],
): FeatChoicePoolResolution {
  if (optionPool.length === 0) return { eligibleFeats: feats }

  const categories = optionPool
    .filter((entry) => entry.startsWith('category:'))
    .map((entry) => entry.slice('category:'.length))
  if (categories.length > 0) {
    const allowedCategories = new Set(categories)
    return {
      eligibleFeats: feats.filter(
        (feat) => Boolean(feat.category) && allowedCategories.has(feat.category ?? ''),
      ),
      initialFilters: { featCategory: allowedCategories },
    }
  }

  const allowedNames = new Set(optionPool.map((entry) => entry.toLowerCase()))
  return {
    eligibleFeats: feats.filter((feat) => allowedNames.has(feat.name.toLowerCase())),
  }
}
