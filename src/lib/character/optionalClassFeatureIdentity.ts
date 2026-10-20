import type {
  Character,
  CharacterClassEntry,
  OptionalClassFeatureAdoption,
  OptionalClassFeatureOwner,
} from '@/types/character'
import { OPTIONAL_CLASS_ADOPTION_ROOTS } from './optionalClassAdoptionRules'

/** Intentional progression mutation only; filtering never invokes this cleanup. */
export function retainEarnedOptionalClassAdoptions(
  character: Character,
  progression: readonly CharacterClassEntry[],
) {
  const key = (value: string | undefined) => value?.trim().toLowerCase()
  return character.optionalClassFeatureAdoptions?.filter((adoption) =>
    progression.some(
      (entry) =>
        key(entry.name) === adoption.owner[1] &&
        key(entry.source) === adoption.owner[2] &&
        entry.levels >= adoption.earnedLevel &&
        (adoption.owner[0] === 'class' ||
          (key(entry.subclass) === adoption.owner[3] &&
            key(entry.subclassSource) === adoption.owner[4])),
    ),
  )
}

const key = (value: unknown) => JSON.stringify(value)
const roots = new Map(
  OPTIONAL_CLASS_ADOPTION_ROOTS.map((root) => [key([root.owner, root.target, root.level]), root]),
)

/** Offline admission is finite: saved labels cannot invent a replacement family or adopt a child. */
export function getOptionalClassAdoptionRule(adoption: OptionalClassFeatureAdoption) {
  if (
    !adoption ||
    typeof adoption !== 'object' ||
    Array.isArray(adoption) ||
    Object.keys(adoption).length !== 3 ||
    Object.keys(adoption).some((key) => !['owner', 'target', 'earnedLevel'].includes(key))
  )
    return undefined
  return roots.get(key([adoption.owner, adoption.target, adoption.earnedLevel]))
}

export function getOptionalClassAdoptionKey(adoption: OptionalClassFeatureAdoption): string {
  return (
    'optional-class-adoption:v1:' +
    encodeURIComponent(key([adoption.owner, adoption.target, adoption.earnedLevel]))
  )
}

export function getInvalidOptionalClassAdoptionIndexes(
  adoptions: readonly OptionalClassFeatureAdoption[],
): number[] {
  const seen = new Map<string, number>(),
    families = new Map<string, number>(),
    invalid = new Set<number>()
  adoptions.forEach((adoption, index) => {
    const root = getOptionalClassAdoptionRule(adoption)
    if (!root) {
      invalid.add(index)
      return
    }
    const id = getOptionalClassAdoptionKey(adoption)
    const family = root?.family && key([adoption.owner, root.family])
    for (const previous of [seen.get(id), family ? families.get(family) : undefined])
      if (previous !== undefined) {
        invalid.add(previous)
        invalid.add(index)
      }
    seen.set(id, index)
    if (family) families.set(family, index)
  })
  return [...invalid]
}

export function optionalClassOwner(owner: {
  name: string
  source: string
  subclassName?: string
  subclassSource?: string
}): OptionalClassFeatureOwner {
  const norm = (value: string) => value.trim().toLowerCase()
  return owner.subclassName && owner.subclassSource
    ? [
        'subclass',
        norm(owner.name),
        norm(owner.source),
        norm(owner.subclassName),
        norm(owner.subclassSource),
      ]
    : ['class', norm(owner.name), norm(owner.source)]
}
