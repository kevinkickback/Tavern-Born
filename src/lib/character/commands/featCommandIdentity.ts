import { makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { SourceTag } from '@/lib/provenance/types'

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
  return feat.grantVariant ? `${feat.name}; ${feat.grantVariant}` : feat.name
}

export function getFeatOptionOwnerKey(feat: FeatOptionTarget): string | undefined {
  if (feat.provenanceChoiceId) return `choice:${feat.provenanceChoiceId}`
  if (feat.classFeatChoiceId) return `class:${feat.classFeatChoiceId}`
  return feat.fixedGrant || feat.grantVariant !== undefined
    ? `fixed:${feat.grantVariant ?? ''}`
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

export function isSameGrantSource(tag: SourceTag, sourceTag: SourceTag): boolean {
  return (
    tag.sourceType === sourceTag.sourceType &&
    tag.sourceName === sourceTag.sourceName &&
    (tag.sourceRef ?? '') === (sourceTag.sourceRef ?? '') &&
    (tag.grantVariant ?? '') === (sourceTag.grantVariant ?? '')
  )
}
