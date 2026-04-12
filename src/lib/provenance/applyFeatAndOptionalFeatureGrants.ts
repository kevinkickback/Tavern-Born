import { addChoicePlaceholder, addGrant } from './ledger'
import { normalizeKey } from './normalization'
import { makeSourceTag } from './sourceLabels'
import type { ChoiceRecord, ProvenanceLedger, SourceType } from './types'

/**
 * Record a feat attribution in the provenance ledger.
 * The source type is always 'feat'; feats added manually by the user are
 * attributed as 'manual' with grantType 'choice'.
 */
export function applyFeatGrant(
  ledger: ProvenanceLedger,
  featName: string,
  featSource: string | undefined,
  /** 'manual' when the player chose the feat via the ASI/feat selection UI. */
  grantedByManual: boolean,
): ProvenanceLedger {
  const tag = grantedByManual
    ? makeSourceTag('manual', 'User Choice', 'choice', featSource)
    : makeSourceTag('feat', featName, 'fixed', featSource)
  return addGrant(ledger, 'feats', featName, tag)
}

/**
 * Record an optional feature attribution in the provenance ledger.
 */
export function applyOptionalFeatureGrant(
  ledger: ProvenanceLedger,
  featureName: string,
  featureSource: string | undefined,
  /** The class or source entity that offered this optional feature. */
  grantingSourceName: string,
  grantingSourceType: 'class' | 'subclass' | 'race' | 'feat' | 'manual',
): ProvenanceLedger {
  const tag = makeSourceTag(grantingSourceType, grantingSourceName, 'choice', featureSource)
  return addGrant(ledger, 'features', featureName, tag)
}

/** A single parsed entry from a 5etools `feats` block. */
export type FeatGrantEntry =
  | { type: 'fixed'; name: string; source: string }
  | { type: 'chooseAny'; count: number }
  | { type: 'chooseFromCategory'; categories: string[]; count: number }

/**
 * Parse the 5etools `feats` array found on races and backgrounds into
 * structured grant entries.
 *
 * Known block shapes in the data:
 * - `{ "feat name|source": true }` — fixed feat grant
 * - `{ "any": N }` — choose N from all feats
 * - `{ "anyFromCategory": { "category": ["O"], "count": N } }` — choose N from category
 */
export function parseFeatGrantBlocks(blocks: unknown[] | undefined): FeatGrantEntry[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return []

  const entries: FeatGrantEntry[] = []
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const obj = block as Record<string, unknown>

    // { "anyFromCategory": { "category": ["O"], "count": 1 } }
    if (obj.anyFromCategory && typeof obj.anyFromCategory === 'object') {
      const cat = obj.anyFromCategory as { category?: string[]; count?: number }
      entries.push({
        type: 'chooseFromCategory',
        categories: Array.isArray(cat.category) ? cat.category : [],
        count: typeof cat.count === 'number' ? cat.count : 1,
      })
      continue
    }

    // { "any": N }
    if ('any' in obj && typeof obj.any === 'number') {
      entries.push({ type: 'chooseAny', count: obj.any })
      continue
    }

    // { "feat name|source": true } — each key is a specific feat grant
    for (const key of Object.keys(obj)) {
      if (obj[key] !== true) continue
      const pipeIndex = key.indexOf('|')
      const name = pipeIndex >= 0 ? key.slice(0, pipeIndex) : key
      const source = pipeIndex >= 0 ? key.slice(pipeIndex + 1) : ''
      entries.push({ type: 'fixed', name, source })
    }
  }
  return entries
}

/**
 * Apply feat grants from parsed feat blocks to the provenance ledger.
 * Fixed feats are added directly; choice-based feats create choice placeholders.
 */
export function applyFeatGrantBlocks(
  ledger: ProvenanceLedger,
  blocks: unknown[] | undefined,
  sourceType: SourceType,
  sourceName: string,
  sourceRef?: string,
): ProvenanceLedger {
  const entries = parseFeatGrantBlocks(blocks)
  if (entries.length === 0) return ledger

  let result = ledger
  const tag = makeSourceTag(sourceType, sourceName, 'fixed', sourceRef)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    switch (entry.type) {
      case 'fixed': {
        result = addGrant(result, 'feats', entry.name, {
          ...tag,
          sourceRef: entry.source || sourceRef,
        })
        break
      }
      case 'chooseAny': {
        const choice: ChoiceRecord = {
          id: `${sourceType}:${normalizeKey(sourceName)}:feats:any:${i}`,
          domain: 'feats',
          sourceTag: { ...tag, grantType: 'placeholder' },
          chooseCount: entry.count,
          optionPool: [],
          selected: [],
          status: 'pending',
        }
        result = addChoicePlaceholder(result, choice)
        break
      }
      case 'chooseFromCategory': {
        const choice: ChoiceRecord = {
          id: `${sourceType}:${normalizeKey(sourceName)}:feats:category:${i}`,
          domain: 'feats',
          sourceTag: { ...tag, grantType: 'placeholder' },
          chooseCount: entry.count,
          optionPool: entry.categories.map((c) => `category:${c}`),
          selected: [],
          status: 'pending',
        }
        result = addChoicePlaceholder(result, choice)
        break
      }
    }
  }

  return result
}
