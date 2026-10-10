import { makeSourceTag } from '@/lib/provenance'
import {
  type FeatSelectionKind,
  getFeatSelectionKey,
  getSelectedFeatOwnerKey,
} from '@/lib/provenance/featSelectionIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

export type FeatOptionTarget = {
  name: string
  source?: string
  grantVariant?: string
  fixedGrant?: boolean
  provenanceChoiceId?: string
  classFeatChoiceId?: string
  selectionKind?: FeatSelectionKind
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
  if (feat.selectionKind) {
    if (feat.selectionKind !== 'ordinary' && feat.selectionKind !== 'bonus') return undefined
    if (
      feat.provenanceChoiceId ||
      feat.classFeatChoiceId ||
      feat.fixedGrant ||
      feat.grantVariant !== undefined
    )
      return undefined
    return getSelectedFeatOwnerKey(feat.selectionKind)
  }
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

export { getFeatSelectionKey }

/** Selection owners must address exactly one active record. Never infer a collection. */
export function isFeatOptionTargetActive(
  character: Pick<Character, 'feats' | 'specialFeats'>,
  feat: FeatOptionTarget,
): boolean {
  if (getFeatOptionOwnerKey(feat) === undefined) return false
  if (!feat.selectionKind) return true
  const records =
    feat.selectionKind === 'ordinary' ? character.feats : (character.specialFeats ?? [])
  return (
    records.filter((entry) => getFeatSelectionKey(entry) === getFeatSelectionKey(feat)).length === 1
  )
}

export function isSameGrantSource(tag: SourceTag, sourceTag: SourceTag): boolean {
  return (
    tag.sourceType === sourceTag.sourceType &&
    normalizeOwnerIdentity(tag.sourceName) === normalizeOwnerIdentity(sourceTag.sourceName) &&
    normalizeOwnerIdentity(tag.sourceRef) === normalizeOwnerIdentity(sourceTag.sourceRef) &&
    (tag.grantVariant ?? '') === (sourceTag.grantVariant ?? '')
  )
}
