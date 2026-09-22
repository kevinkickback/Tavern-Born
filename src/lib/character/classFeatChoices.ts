import { normalizeKey } from '@/lib/provenance/normalization'

export interface ClassFeatChoiceOwner {
  choiceId?: string
  className: string
  classSource: string
  subclassName?: string
  subclassSource?: string
  progressionName: string
  categories: string[]
}

export function getClassFeatChoiceId(owner: ClassFeatChoiceOwner): string {
  if (owner.choiceId) return owner.choiceId
  const parts = [normalizeKey(owner.className), normalizeKey(owner.classSource)]
  if (owner.subclassName || owner.subclassSource) {
    parts.push(normalizeKey(owner.subclassName ?? ''), normalizeKey(owner.subclassSource ?? ''))
  }
  parts.push(
    normalizeKey(owner.progressionName),
    [...owner.categories].sort().map(normalizeKey).join(','),
  )
  return parts.join('|')
}
