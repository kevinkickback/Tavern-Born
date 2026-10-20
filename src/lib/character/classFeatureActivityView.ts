import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, OptionalClassFeatureOwner } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceFeatureId, getClassChoiceOptionKey } from './classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import { getEffectiveClassChoiceFeatureRoutes } from './effectiveClassChoiceFeatures'
import type { OptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

export type ClassFeatureDetailOrigin =
  | { kind: 'declared'; owner: OptionalClassFeatureOwner; target: string; earnedLevel: number }
  | {
      kind: 'choice'
      owner: OptionalClassFeatureOwner
      choiceId: string
      earnedLevel: number
      optionKey: string
    }
  | { kind: 'independent' }

/** Re-resolve an exact selected contribution; a surviving choice ID alone cannot retain stale text. */
export function resolveActiveClassChoiceDetail(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs,
  origin: Extract<ClassFeatureDetailOrigin, { kind: 'choice' }>,
) {
  if (!getEffectiveClassChoiceFeatureRoutes(character, catalogs).choiceIds.has(origin.choiceId))
    return undefined
  const selection = character.classChoiceSelections?.find(
    (row) =>
      row.choiceId === origin.choiceId &&
      row.classLevel === origin.earnedLevel &&
      JSON.stringify(
        optionalClassOwner({
          name: row.className,
          source: row.classSource,
          subclassName: row.subclassName,
          subclassSource: row.subclassSource,
        }),
      ) === JSON.stringify(origin.owner),
  )
  const selected = selection?.selected.find(
    (row) => getClassChoiceOptionKey(row) === origin.optionKey,
  )
  if (!selection || !selected) return undefined
  if (
    ['classFeature', 'subclassFeature', 'optionalFeature'].includes(selected.entityType) &&
    !getEffectiveClassChoiceFeatureRoutes(character, catalogs).featureIds.has(
      getClassChoiceFeatureId(selection, selected),
    )
  )
    return undefined
  const owner = findClassReference(
    { name: selection.className, source: selection.classSource },
    character.classProgression,
  )
  const cls = owner && findClassReference(owner, catalogs.classes ?? [])
  const choice =
    cls &&
    owner &&
    getClassChoiceCandidates(cls, getSelectedSubclassData(cls, owner), catalogs).find(
      (row) => row.id === origin.choiceId,
    )
  if (!owner || !choice || selected.slotLevel < choice.level || selected.slotLevel > owner.levels)
    return undefined
  const option = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    selection.selected,
    owner.levels,
    character,
  ).find(
    (row) =>
      row.availability === 'eligible' &&
      getClassChoiceOptionKey(row.reference) === origin.optionKey,
  )
  return (
    option && {
      name: option.reference.name,
      source: option.reference.source,
      entries: option.entries,
    }
  )
}

/** Only declared class content enters here. Independent feat/item/spell previews use their own routes. */
export function effectiveDeclaredEntries(
  values: unknown[],
  activity: OptionalClassFeatureActivity,
  owner: OptionalClassFeatureOwner,
  target?: string,
): unknown[] {
  const seen = new WeakMap<object, unknown>()
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value
    if (seen.has(value)) return seen.get(value)
    if (Array.isArray(value)) {
      const result: unknown[] = []
      seen.set(value, result)
      for (const item of value) {
        const next = visit(item)
        if (next !== undefined) result.push(next)
      }
      return result
    }
    const row = value as Record<string, unknown>
    const ref =
      typeof row.classFeature === 'string'
        ? row.classFeature
        : typeof row.subclassFeature === 'string'
          ? row.subclassFeature
          : typeof row.ref === 'string'
            ? row.ref
            : undefined
    const subclass = row.type === 'refSubclassFeature' || owner[0] === 'subclass'
    const identity = ref
      ? subclass
        ? getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref))
        : getClassFeatureIdentity(decodeClassFeatureReference(ref))
      : subclass
        ? getSubclassFeatureIdentity(row)
        : getClassFeatureIdentity(row)
    const level = ref
      ? subclass
        ? decodeSubclassFeatureReference(ref).level
        : decodeClassFeatureReference(ref).level
      : row.level
    if (
      identity &&
      typeof level === 'number' &&
      !activity.declared(owner, identity, level, undefined, row.isClassFeatureVariant === true)
    )
      return undefined
    if (!identity && row.isClassFeatureVariant === true) return undefined
    const result = { ...row }
    seen.set(value, result)
    for (const field of ['entries', 'items', 'feature']) {
      if (result[field] && typeof result[field] === 'object') {
        const content =
          field === 'entries' && identity && Array.isArray(result[field])
            ? activity.entries(owner, identity, result[field])
            : result[field]
        result[field] = visit(content)
      }
    }
    return result
  }
  return visit(target ? activity.entries(owner, target, values) : values) as unknown[]
}

/** Presentation clone only. Original catalog objects, proofs and raw action identities stay immutable. */
export function effectiveClassDisplayData(
  classData: Class5e | undefined,
  activity: OptionalClassFeatureActivity,
): Class5e | undefined {
  if (!classData) return classData
  const owner = optionalClassOwner(classData)
  const subclass = (value: Subclass5e): Subclass5e => {
    const subOwner = optionalClassOwner({
      ...classData,
      subclassName: value.name,
      subclassSource: value.source,
    })
    const current = (feature: {
      name: string
      source?: string
      level?: number
      entries?: unknown[]
    }) => {
      const target = getSubclassFeatureIdentity(feature)
      return target && activity.declared(subOwner, target, feature.level ?? 1)
    }
    return {
      ...value,
      entries: effectiveDeclaredEntries(value.entries ?? [], activity, subOwner),
      subclassFeatureRefs: value.subclassFeatureRefs
        ?.filter((row) => row.feature && current(row.feature))
        .map((row) => ({
          ...row,
          feature: row.feature
            ? {
                ...row.feature,
                entries: effectiveDeclaredEntries(
                  row.feature.entries ?? [],
                  activity,
                  subOwner,
                  getSubclassFeatureIdentity(row.feature),
                ),
                origin: {
                  kind: 'declared' as const,
                  owner: subOwner,
                  target: getSubclassFeatureIdentity(row.feature)!,
                  earnedLevel: row.level ?? row.feature.level ?? 1,
                },
              }
            : undefined,
        })),
      levelFeatures: value.levelFeatures?.map((group) => ({
        ...group,
        features: group.features.filter(current).map((feature) => ({
          ...feature,
          origin: {
            kind: 'declared' as const,
            owner: subOwner,
            target: getSubclassFeatureIdentity(feature)!,
            earnedLevel: group.level,
          },
          entries: effectiveDeclaredEntries(
            feature.entries ?? [],
            activity,
            subOwner,
            getSubclassFeatureIdentity(feature),
          ),
        })),
      })),
    }
  }
  return {
    ...classData,
    entries: effectiveDeclaredEntries(
      Array.isArray(classData.entries) ? classData.entries : [],
      activity,
      owner,
    ),
    subclasses: classData.subclasses?.map(subclass),
  }
}
