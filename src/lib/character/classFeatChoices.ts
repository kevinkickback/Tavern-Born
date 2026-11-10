import { getClassFeatureSpellSemantics } from '@/lib/5etools/featureSpellSemantics'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'

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

/** Routing intent survives an unavailable catalog; the class producer still proves every grant. */
export function hasClassFeatSpellSetup(
  character: Character | null | undefined,
  choiceId: string | undefined,
  name: string,
  source?: string,
) {
  if (!choiceId) return false
  if (getClassFeatureSpellSemantics('feat', name, source ?? '')) return true
  const owners = character?.classFeatChoices?.filter((row) => row.id === choiceId)
  const selections = character?.classChoiceSelections?.filter((row) => row.choiceId === choiceId)
  if (owners?.length !== 1 || selections?.length !== 1) return false
  const [owner] = owners
  const [selection] = selections
  const matches = (ref: { name: string; source?: string }) =>
    normalizeKey(ref.name) === normalizeKey(name) &&
    normalizeKey(ref.source ?? '') === normalizeKey(source ?? '')
  return (
    selection.kind === 'feat' &&
    normalizeKey(selection.className) === normalizeKey(owner.className) &&
    normalizeKey(selection.classSource) === normalizeKey(owner.classSource) &&
    normalizeKey(selection.subclassName ?? '') === normalizeKey(owner.subclassName ?? '') &&
    normalizeKey(selection.subclassSource ?? '') === normalizeKey(owner.subclassSource ?? '') &&
    owner.feats.some(
      (feat) =>
        feat.classSpellSetup &&
        matches(feat) &&
        selection.selected.some(
          (option) =>
            option.entityType === 'feat' && matches(option) && option.slotLevel === feat.classLevel,
        ),
    )
  )
}
