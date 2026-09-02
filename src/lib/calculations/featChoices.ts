import type { Feat5e } from '@/types/5etools'

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
