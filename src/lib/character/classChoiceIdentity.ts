import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { decodeProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { getFeatureOptionKey } from '@/lib/5etools/featureOptionIdentity'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import type {
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
  Feature,
} from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'

/** Legacy filter producers use either prefix for subclass UIDs; owner.type defines the schema. */
export function getClassChoiceDeclaration(
  choice: NormalizedCharacterChoice,
): { target?: string } | undefined {
  const prefix = ['classFeatureRefs:', 'subclassFeatureRefs:'].find((value) =>
    choice.source.field.startsWith(value),
  )
  if (!prefix) return undefined
  const end = choice.source.field.indexOf(':entries', prefix.length)
  if (end <= prefix.length) return {}
  const uid = choice.source.field.slice(prefix.length, end)
  const feature =
    choice.owner.type === 'subclass'
      ? decodeSubclassFeatureReference(uid)
      : decodeClassFeatureReference(uid)
  const target =
    choice.owner.type === 'subclass'
      ? getSubclassFeatureIdentity(feature)
      : getClassFeatureIdentity(feature)
  const key = (value: string) => value.trim().toLowerCase()
  if (
    !target ||
    choice.level !== feature.level ||
    (choice.owner.featureName !== undefined &&
      key(choice.owner.featureName) !== key(feature.name)) ||
    (choice.owner.featureSource !== undefined &&
      key(choice.owner.featureSource) !== key(feature.source ?? ''))
  )
    return {}
  return { target }
}

/** The selected owner is independent of the parent encoded by a copied feature UID. */
export function getFeatureOwnerKey(
  className: string,
  classSource: string | undefined,
  subclassName?: string,
  subclassSource?: string,
): string {
  return JSON.stringify([
    getEntityLookupKey(className, classSource).toLowerCase(),
    ...(subclassName ? [getEntityLookupKey(subclassName, subclassSource).toLowerCase()] : []),
  ])
}

export function getClassChoiceFeatureTarget(
  option: NormalizedChoiceOptionReference,
): string | undefined {
  if (!option.ref) return undefined
  const target =
    option.entityType === 'classFeature'
      ? decodeClassFeatureReference(option.ref)
      : option.entityType === 'subclassFeature'
        ? decodeSubclassFeatureReference(option.ref)
        : undefined
  if (
    !target ||
    getEntityLookupKey(target.name, target.source).toLowerCase() !==
      getEntityLookupKey(option.name, option.source?.trim() || target.source).toLowerCase()
  )
    return undefined
  return option.entityType === 'classFeature'
    ? getClassFeatureIdentity(target)
    : getSubclassFeatureIdentity(target)
}

export function getClassChoiceOptionKey(option: NormalizedChoiceOptionReference): string {
  if (option.entityType === 'proficiency') {
    const target = decodeProficiencyOption(option)
    return target
      ? `proficiency:${target.domain}:${target.name}`
      : `invalid-proficiency:${JSON.stringify(option)}`
  }
  if (option.entityType === 'featureOption')
    return getFeatureOptionKey(option) ?? `invalid-feature-option:${JSON.stringify(option)}`
  return (
    getClassChoiceFeatureTarget(option) ??
    `${option.entityType}|${getEntityLookupKey(option.name, option.source).toLowerCase()}${option.ref ? `|unresolved:${option.ref}` : ''}`
  )
}

/** Shared grants retain their ID when one granting choice is removed. */
export function getClassChoiceFeatureId(
  selection: CharacterClassChoiceSelection,
  option: NormalizedChoiceOptionReference,
): string {
  return `class-choice:${encodeURIComponent(
    JSON.stringify([
      getFeatureOwnerKey(
        selection.className,
        selection.classSource,
        selection.subclassName,
        selection.subclassSource,
      ),
      getClassChoiceOptionKey(option),
    ]),
  )}`
}

/** Same exact managed row for commands and read-only current-intent projection. */
export function getClassChoiceGrantedFeature(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
): Feature {
  return {
    id: getClassChoiceFeatureId(selection, option),
    name: option.name,
    source:
      option.source?.trim() || getClassChoiceFeatureTarget(option)?.split('|').slice(-1)[0] || '',
    description: '',
    level: option.slotLevel,
  }
}
