import { ABILITY_CATALOG_FALLBACK, ORIGIN_BACKGROUND_FALLBACK } from '@/lib/5etools/rulesetMetadata'
import type { Background5e } from '@/types/5etools'

export interface NormalizedBackgroundOriginRules {
  ability: unknown[]
  feats: unknown[]
  sourceKey: string
  fallbackSource?: string
}

const FALLBACK_ABILITY = ORIGIN_BACKGROUND_FALLBACK.abilityWeights.map((weights) => ({
  choose: {
    weighted: {
      from: ABILITY_CATALOG_FALLBACK.map((ability) => ability.name),
      weights: [...weights],
    },
  },
}))

const FALLBACK_FEATS = [
  {
    anyFromCategory: {
      category: [ORIGIN_BACKGROUND_FALLBACK.featCategory],
      count: ORIGIN_BACKGROUND_FALLBACK.featCount,
    },
  },
]

export function normalizeBackgroundOriginRules(
  background: Pick<Background5e, 'name' | 'source' | 'ability' | 'feats'>,
): NormalizedBackgroundOriginRules {
  const hasAbility = Array.isArray(background.ability) && background.ability.length > 0
  const hasFeats = Array.isArray(background.feats) && background.feats.length > 0
  return {
    ability: hasAbility ? (background.ability ?? []) : FALLBACK_ABILITY,
    feats: hasFeats ? (background.feats ?? []) : FALLBACK_FEATS,
    sourceKey: `${background.name}|${background.source}`,
    ...(!hasAbility || !hasFeats ? { fallbackSource: ORIGIN_BACKGROUND_FALLBACK.source } : {}),
  }
}
