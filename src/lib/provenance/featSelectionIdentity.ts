import { normalizeOwnerIdentity } from './normalization'

export type FeatSelectionKind = 'ordinary' | 'bonus'

/** Separate complete fields; literal pipes and markup are not reference syntax here. */
export function getFeatSelectionKey(feat: { name: string; source?: string }): string {
  return JSON.stringify([normalizeOwnerIdentity(feat.name), normalizeOwnerIdentity(feat.source)])
}

export function getSelectedFeatOwnerKey(kind: FeatSelectionKind): string {
  return `selection:${kind}`
}
