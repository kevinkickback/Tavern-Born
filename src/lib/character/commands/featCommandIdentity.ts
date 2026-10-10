import { makeSourceTag } from '@/lib/provenance'
import { normalizeKey, normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

export type FeatOptionTarget = {
  name: string
  source?: string
  grantVariant?: string
  fixedGrant?: boolean
  provenanceChoiceId?: string
  classFeatChoiceId?: string
}

export interface SelectedFeat {
  name: string
  source?: string
  className?: string
  classSource?: string
  classLevel?: number
}

export function getFeatOptionSourceName(feat: FeatOptionTarget): string {
  return feat.grantVariant ? `${feat.name.trim()}; ${feat.grantVariant.trim()}` : feat.name
}

export function getFeatOptionOwnerKey(feat: FeatOptionTarget): string | undefined {
  if (feat.provenanceChoiceId) return `choice:${feat.provenanceChoiceId}`
  if (feat.classFeatChoiceId) return `class:${feat.classFeatChoiceId}`
  return feat.fixedGrant || feat.grantVariant !== undefined
    ? `fixed:${feat.grantVariant?.trim() ?? ''}`
    : undefined
}

export function getFeatOptionSourceTag(feat: FeatOptionTarget): SourceTag {
  return {
    ...makeSourceTag('feat', getFeatOptionSourceName(feat), 'choice', feat.source),
    grantVariant: getFeatOptionOwnerKey(feat),
  }
}

export function getFeatSelectionKey(feat: { name: string; source?: string }): string {
  return `${normalizeKey(feat.name)}|${normalizeKey(feat.source ?? '')}`
}

/** Selected and bonus setups currently share an unqualified owner; do not guess between them. */
export function hasSharedFeatOptionOwner(
  character: Pick<Character, 'feats' | 'specialFeats'>,
  feat: FeatOptionTarget,
): boolean {
  if (getFeatOptionOwnerKey(feat) !== undefined) return false
  const matches = (entry: { name: string; source?: string }) =>
    normalizeOwnerIdentity(entry.name) === normalizeOwnerIdentity(feat.name) &&
    normalizeOwnerIdentity(entry.source) === normalizeOwnerIdentity(feat.source)
  return character.feats.some(matches) && (character.specialFeats ?? []).some(matches)
}

export function isSameGrantSource(tag: SourceTag, sourceTag: SourceTag): boolean {
  return (
    tag.sourceType === sourceTag.sourceType &&
    tag.sourceName === sourceTag.sourceName &&
    (tag.sourceRef ?? '') === (sourceTag.sourceRef ?? '') &&
    (tag.grantVariant ?? '') === (sourceTag.grantVariant ?? '')
  )
}
