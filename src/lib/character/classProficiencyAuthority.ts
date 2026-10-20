import { getCurrentClassProficiencyChoices } from '@/lib/5etools/classProficiencyChoices'
import { isClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getSubclassProficiencyOwner,
  subclassProficiencyDigest,
} from '@/lib/5etools/subclassProficiencyCertificates'
import { normalizeSubclassProficiencyChoices } from '@/lib/5etools/subclassProficiencyChoices'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { getOptionalClassProficiencyCandidates } from './optionalClassProficiencyChoices'

/** Full current owner collections are checked before any selected-root/feature first-match projection. */
export function getCurrentOwnedProficiencyCandidates(
  classData: Pick<Class5e, 'name' | 'source' | 'classFeatureRefs'>,
  includeVariants: boolean,
  catalogs?: ClassChoiceFeatureCatalogs,
  selectedSubclass?: Pick<Subclass5e, 'name' | 'source'>,
): NormalizedCharacterChoice[] {
  const choices = [
    ...getCurrentClassProficiencyChoices(classData, includeVariants, catalogs),
    ...(includeVariants ? getOptionalClassProficiencyCandidates(classData, catalogs) : []),
  ]
  if (!catalogs?.subclassTargets || !selectedSubclass) return choices
  const key = (value: string) => value.trim().toLowerCase()
  const parents = (catalogs.classes ?? []).filter(
    (row) => key(row.name) === key(classData.name) && key(row.source) === key(classData.source),
  )
  if (parents.length !== 1) return choices
  const selectedOwner = [
    key(classData.name),
    key(classData.source),
    key(selectedSubclass.name),
    key(selectedSubclass.source),
  ]
  const roots = (parents[0].subclasses ?? []).filter(
    (row) => JSON.stringify(getSubclassProficiencyOwner(row)) === JSON.stringify(selectedOwner),
  )
  if (roots.length !== 1) return choices
  const subclass = roots[0]
  const owner = {
    type: 'subclass' as const,
    name: classData.name,
    source: classData.source,
    subclassName: subclass.name,
    subclassSource: subclass.source,
  }
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(owner.name, owner.source, subclass.name, subclass.source),
  )
  // No unscoped/raw fallback for missing candidates, including explicitly empty supplied indexes.
  if (!scoped.subclassFeatureCandidates) return choices
  const canonical = normalizeSubclassProficiencyChoices(
    owner,
    subclass,
    subclass.subclassFeatureRefs ?? [],
    scoped.subclassFeatureCandidates,
  )
  const claimed = (subclass.normalizedRules?.choices ?? []).filter(
    (row) => row.kind === 'proficiency' || isClassProficiencyChoiceId(row.id),
  )
  if (
    claimed.some(
      (row) =>
        !canonical.some(
          (current) => subclassProficiencyDigest(current) === subclassProficiencyDigest(row),
        ),
    )
  )
    return choices
  return [...choices, ...canonical]
}

export function getEarnedOwnerProficiencyCandidates(
  owner: CharacterClassEntry,
  includeVariants: boolean,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const classData = findClassReference(owner, catalogs?.classes ?? [])
  if (!classData) return []
  return getCurrentOwnedProficiencyCandidates(
    classData,
    includeVariants,
    catalogs,
    owner.subclass && owner.subclassSource
      ? { name: owner.subclass, source: owner.subclassSource }
      : undefined,
  ).filter((choice) => choice.level <= owner.levels)
}

/** Character entitlement is an additional gate after complete current source candidate validation. */
export function getEffectiveOwnerProficiencyChoices(
  character: Character,
  owner: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return getEarnedOwnerProficiencyCandidates(owner, true, catalogs).filter(activity.choice)
}
