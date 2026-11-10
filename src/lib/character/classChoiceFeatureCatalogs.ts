import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { getConcreteToolProficiencyName } from '@/lib/5etools/concreteToolProficiencies'
import { getConditionalOptionalIdentity } from '@/lib/5etools/conditionalProficiencySource'
import {
  buildClassFeatureLookup,
  buildItemPropertyLookup,
  buildItemTypeLookup,
} from '@/lib/5etools/lookups'
import { getItemTypeCodes, isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import type {
  Class5e,
  ClassFeature,
  Creature5e,
  Feat5e,
  GameData,
  Item5e,
  Language5e,
  OptionalClassFeatureSourceProof,
  OptionalClassSectionSource,
  OptionalFeatureLike,
  Subclass5e,
  SubclassFeature,
} from '@/types/5etools'
import type { ClassCastingSourceProof } from '@/types/classCasting'
import { getFeatureOwnerKey } from './classChoiceIdentity'

export interface ClassChoiceFeatureCatalogs {
  legacySubclassChoices?: GameData['legacySubclassChoices']
  psionics?: readonly import('@/types/5etools').Psionic5e[]
  classes?: readonly Class5e[]
  creatures?: readonly Creature5e[]
  optionalClassFeatureSources?: readonly OptionalClassFeatureSourceProof[]
  classCastingSources?: readonly ClassCastingSourceProof[]
  optionalClassSections?: readonly OptionalClassSectionSource[]
  skills?: readonly unknown[]
  languages?: readonly Language5e[]
  proficiencyTools?: readonly Item5e[]
  allConcreteTools?: readonly Item5e[]
  items?: readonly Item5e[]
  itemsBase?: readonly Item5e[]
  itemPropertyByAbbr?: Readonly<Record<string, string>>
  itemTypeByAbbr?: Readonly<Record<string, string>>
  featExpertiseFeats?: readonly Feat5e[]
  optionalFeatures?: readonly OptionalFeatureLike[]
  optionalFeatureCandidates?: ReadonlyMap<string, readonly OptionalFeatureLike[]>
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
  /** Retain multiplicity for required-setup audits before the lookup projection. */
  ambiguousClassFeatureTargets?: ReadonlySet<string>
  subclassFeatures: readonly SubclassFeature[]
  /** Complete producers for literal options, preserved before the generic lookup projection. */
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
  /** Composed catalogs retain full owners; class-owned targets must have one exact owner. */
  subclassTargets?: ReturnType<typeof indexSubclassFeatureTargets>
}

export type ScopedClassChoiceFeatureCatalogs = Pick<
  ClassChoiceFeatureCatalogs,
  | 'classFeatures'
  | 'legacySubclassChoices'
  | 'psionics'
  | 'classFeatureCandidates'
  | 'ambiguousClassFeatureTargets'
  | 'subclassFeatures'
  | 'subclassFeatureCandidates'
  | 'skills'
  | 'languages'
  | 'proficiencyTools'
  | 'allConcreteTools'
  | 'featExpertiseFeats'
  | 'classes'
  | 'creatures'
  | 'optionalFeatures'
  | 'optionalFeatureCandidates'
  | 'optionalClassFeatureSources'
  | 'classCastingSources'
  | 'optionalClassSections'
>
const scopedCatalogCache = new WeakMap<
  ClassChoiceFeatureCatalogs,
  Map<string | undefined, ScopedClassChoiceFeatureCatalogs>
>()
export function scopeClassChoiceFeatureCatalogs(
  catalogs: ClassChoiceFeatureCatalogs,
  subclassOwner?: string,
): ScopedClassChoiceFeatureCatalogs {
  if (!catalogs.subclassTargets) return catalogs
  let scoped = scopedCatalogCache.get(catalogs)
  if (!scoped) {
    scoped = new Map()
    scopedCatalogCache.set(catalogs, scoped)
  }
  const prior = scoped.get(subclassOwner)
  if (prior) return prior
  const targets = subclassOwner
    ? catalogs.subclassTargets.byOwner.get(subclassOwner)
    : catalogs.subclassTargets.unique
  const candidates = subclassOwner
    ? catalogs.subclassTargets.candidatesByOwner.get(subclassOwner)
    : catalogs.subclassTargets.uniqueCandidates
  const result = {
    legacySubclassChoices: catalogs.legacySubclassChoices,
    psionics: catalogs.psionics,
    classFeatures: catalogs.classFeatures,
    skills: catalogs.skills,
    languages: catalogs.languages,
    classes: catalogs.classes,
    ...(catalogs.creatures ? { creatures: catalogs.creatures } : {}),
    optionalClassFeatureSources: catalogs.optionalClassFeatureSources,
    classCastingSources: catalogs.classCastingSources,
    optionalClassSections: catalogs.optionalClassSections,
    proficiencyTools: catalogs.proficiencyTools,
    allConcreteTools: catalogs.allConcreteTools,
    featExpertiseFeats: catalogs.featExpertiseFeats,
    optionalFeatures: catalogs.optionalFeatures,
    optionalFeatureCandidates: catalogs.optionalFeatureCandidates,
    classFeatureCandidates: catalogs.classFeatureCandidates,
    ambiguousClassFeatureTargets: catalogs.ambiguousClassFeatureTargets,
    subclassFeatures: [...(targets?.values() ?? [])],
    subclassFeatureCandidates: candidates ?? new Map(),
  }
  scoped.set(subclassOwner, result)
  return result
}

/** Build all qualified targets together from one authoritative, complete filtered data view. */
export function buildClassChoiceFeatureCatalogs(
  data: Pick<GameData, 'classes' | 'classFeatures'> &
    Partial<
      Pick<
        GameData,
        | 'skills'
        | 'legacySubclassChoices'
        | 'psionics'
        | 'languages'
        | 'items'
        | 'itemsBase'
        | 'itemProperties'
        | 'itemTypes'
        | 'feats'
        | 'optionalfeatures'
        | 'optionalClassFeatureSources'
        | 'classCastingSources'
        | 'optionalClassSections'
        | 'creatures'
      >
    >,
) {
  const subclassTargets = indexSubclassFeatureTargets(data.classes)
  const seenClassTargets = new Set<string>()
  const classFeatureCandidates = new Map<string, ClassFeature[]>()
  const ambiguousClassFeatureTargets = new Set<string>()
  const optionalFeatures = (data.optionalfeatures ?? []).filter(
    (row): row is OptionalFeatureLike =>
      !!row && typeof row === 'object' && 'name' in row && typeof row.name === 'string',
  )
  const optionalFeatureCandidates = new Map<string, OptionalFeatureLike[]>()
  for (const row of optionalFeatures) {
    const target = getConditionalOptionalIdentity(row)
    if (target)
      optionalFeatureCandidates.set(target, [...(optionalFeatureCandidates.get(target) ?? []), row])
  }
  for (const feature of data.classFeatures) {
    const target = getClassFeatureIdentity(feature)
    if (!target) continue
    classFeatureCandidates.set(target, [...(classFeatureCandidates.get(target) ?? []), feature])
    if (seenClassTargets.has(target)) ambiguousClassFeatureTargets.add(target)
    seenClassTargets.add(target)
  }
  return {
    legacySubclassChoices: data.legacySubclassChoices ?? [],
    classes: data.classes,
    ...(data.creatures ? { creatures: data.creatures } : {}),
    psionics: data.psionics ?? [],
    optionalClassFeatureSources: data.optionalClassFeatureSources ?? [],
    classCastingSources: data.classCastingSources ?? [],
    optionalClassSections: data.optionalClassSections ?? [],
    skills: data.skills ?? [],
    languages: data.languages ?? [],
    items: data.items ?? [],
    itemsBase: data.itemsBase ?? [],
    itemPropertyByAbbr: buildItemPropertyLookup(data.itemProperties ?? []),
    itemTypeByAbbr: buildItemTypeLookup(data.itemTypes ?? []),
    proficiencyTools: [...(data.items ?? []), ...(data.itemsBase ?? [])].filter(
      (item) =>
        isSelectableEquipmentItem(item) &&
        getItemTypeCodes(item.type).some((type) => type === 'AT' || type === 'GS'),
    ),
    allConcreteTools: [...(data.items ?? []), ...(data.itemsBase ?? [])].filter(
      (item) => !!getConcreteToolProficiencyName(item),
    ),
    featExpertiseFeats: data.feats ?? [],
    optionalFeatures,
    optionalFeatureCandidates,
    classFeatureCandidates,
    ambiguousClassFeatureTargets,
    classFeatures: Object.values(buildClassFeatureLookup(data.classFeatures)),
    subclassFeatures: [...subclassTargets.unique.values()],
    subclassTargets,
    subclassFeatureCandidates: subclassTargets.uniqueCandidates,
  }
}

export function collectSubclassFeatures(subclass: Subclass5e | undefined): SubclassFeature[] {
  const features = new Set<SubclassFeature>()
  const traversed = new Set<object>()
  const visit = (feature: SubclassFeature | undefined) => {
    if (!feature || features.has(feature)) return
    features.add(feature)
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object' || traversed.has(value)) return
      traversed.add(value)
      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }
      const record = value as Record<string, unknown>
      if (record.type === 'refSubclassFeature' && record.feature) {
        visit(record.feature as SubclassFeature)
      }
      Object.values(record).forEach(walk)
    }
    walk(feature.entries)
  }
  for (const feature of subclass?.subclassFeatures ?? []) {
    if (typeof feature === 'object') visit(feature)
  }
  for (const reference of subclass?.subclassFeatureRefs ?? []) visit(reference.feature)
  for (const group of subclass?.levelFeatures ?? []) group.features.forEach(visit)
  return [...features]
}

/** Catalog copies of one target remain unique within their actual full owner. */
export function indexSubclassFeatureTargets(classes: readonly Class5e[]) {
  const byOwner = new Map<string, Map<string, SubclassFeature>>()
  const candidatesByOwner = new Map<string, Map<string, SubclassFeature[]>>()
  for (const classData of classes) {
    for (const subclass of classData.subclasses ?? []) {
      const owner = getFeatureOwnerKey(
        classData.name,
        classData.source,
        subclass.name,
        subclass.source,
      )
      const targets = byOwner.get(owner) ?? new Map<string, SubclassFeature>()
      const candidates = candidatesByOwner.get(owner) ?? new Map<string, SubclassFeature[]>()
      const references = new Set<string>()
      const ambiguousReferences = new Set<string>()
      for (const reference of subclass.subclassFeatureRefs ?? []) {
        const target = getSubclassFeatureIdentity(reference)
        if (!target) continue
        if (reference.sourceIdentityConflict || references.has(target))
          ambiguousReferences.add(target)
        references.add(target)
      }
      for (const feature of collectSubclassFeatures(subclass)) {
        const target = getSubclassFeatureIdentity(feature)
        if (target) {
          targets.set(target, feature)
          const producers = candidates.get(target) ?? []
          if (ambiguousReferences.has(target)) {
            producers.push({ ...feature, sourceIdentityConflict: true })
          } else if (!producers.includes(feature)) {
            producers.push(feature)
          }
          candidates.set(target, producers)
        }
      }
      byOwner.set(owner, targets)
      candidatesByOwner.set(owner, candidates)
    }
  }
  const unique = new Map<string, SubclassFeature>()
  const ambiguous = new Set<string>()
  for (const targets of byOwner.values()) {
    for (const [target, feature] of targets) {
      if (unique.has(target)) {
        unique.delete(target)
        ambiguous.add(target)
      } else if (!ambiguous.has(target)) unique.set(target, feature)
    }
  }
  const uniqueCandidates = new Map<string, readonly SubclassFeature[]>()
  for (const candidates of candidatesByOwner.values()) {
    for (const [target, producers] of candidates) {
      if (unique.has(target)) uniqueCandidates.set(target, producers)
    }
  }
  return { byOwner, unique, candidatesByOwner, uniqueCandidates }
}
