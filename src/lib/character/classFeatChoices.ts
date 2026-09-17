import { normalizeKey } from '@/lib/provenance/normalization'

export interface ClassFeatChoiceOwner {
  choiceId?: string
  className: string
  classSource: string
  progressionName: string
  categories: string[]
}

export function getClassFeatChoiceId(owner: ClassFeatChoiceOwner): string {
  if (owner.choiceId) return owner.choiceId
  return [
    normalizeKey(owner.className),
    normalizeKey(owner.classSource),
    normalizeKey(owner.progressionName),
    [...owner.categories].sort().map(normalizeKey).join(','),
  ].join('|')
}
