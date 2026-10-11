import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'

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
