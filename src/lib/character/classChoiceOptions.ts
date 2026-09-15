import type { ClassFeature, Feat5e, Item5e, OptionalFeatureLike } from '@/types/5etools'
import type { CharacterClassChoiceOption } from '@/types/character'
import type {
  ChoiceOptionEntityType,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'

export interface ClassChoiceOptionView {
  reference: NormalizedChoiceOptionReference
  entries: unknown[]
}

export interface ClassChoiceCatalogs {
  classFeatures: readonly ClassFeature[]
  feats: readonly Feat5e[]
  items: readonly Item5e[]
  optionalFeatures: readonly OptionalFeatureLike[]
  itemTypeByAbbr: Readonly<Record<string, string>>
}

type ChoiceCatalogEntity = ClassFeature | Feat5e | Item5e | OptionalFeatureLike

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function getClassChoiceOptionKey(
  option: Pick<NormalizedChoiceOptionReference, 'entityType' | 'name' | 'source'>,
): string {
  return `${option.entityType}|${normalized(option.name)}|${normalized(option.source)}`
}

function getCatalog(
  entityType: ChoiceOptionEntityType,
  catalogs: ClassChoiceCatalogs,
): readonly ChoiceCatalogEntity[] {
  if (entityType === 'classFeature') return catalogs.classFeatures
  if (entityType === 'feat') return catalogs.feats
  if (entityType === 'item') return catalogs.items
  return catalogs.optionalFeatures
}

function getFeatureTypes(entity: ChoiceCatalogEntity): string[] {
  const raw = (entity as OptionalFeatureLike).featureType
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .map(normalized)
}

function getItemTypeLabels(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string[] {
  const rawTypes = Array.isArray(item.type) ? item.type : [item.type]
  const typeCodes = rawTypes
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split('|')[0]?.trim())
    .filter((value): value is string => Boolean(value))
  const weaponCategory = normalized(item.weaponCategory)
  return [
    ...typeCodes,
    ...typeCodes.map((code) => itemTypeByAbbr[code.toUpperCase()]),
    item.weaponCategory,
    weaponCategory ? `${weaponCategory} weapon` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalized)
}

function matchesAny(actual: readonly string[], expected: readonly string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const actualValues = new Set(actual.map(normalized))
  return expected.some((value) => actualValues.has(normalized(value)))
}

function matchesFilter(
  entity: ChoiceCatalogEntity,
  filter: NormalizedChoiceOptionFilter,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): boolean {
  if (filter.source && normalized(entity.source) !== normalized(filter.source)) return false
  if (
    filter.entityType === 'feat' &&
    !matchesAny([(entity as Feat5e).category ?? ''], filter.categories)
  ) {
    return false
  }
  if (
    filter.entityType === 'optionalFeature' &&
    !matchesAny(getFeatureTypes(entity), filter.featureTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    !matchesAny(getItemTypeLabels(entity as Item5e, itemTypeByAbbr), filter.itemTypes)
  ) {
    return false
  }
  return true
}

function toView(
  entityType: ChoiceOptionEntityType,
  entity: ChoiceCatalogEntity,
): ClassChoiceOptionView {
  return {
    reference: {
      entityType,
      name: entity.name,
      ...(entity.source ? { source: entity.source } : {}),
    },
    entries: Array.isArray(entity.entries) ? entity.entries : [],
  }
}

function resolveExplicitOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceCatalogs,
): ClassChoiceOptionView {
  const match = getCatalog(option.entityType, catalogs).find(
    (entity) =>
      normalized(entity.name) === normalized(option.name) &&
      (!option.source || normalized(entity.source) === normalized(option.source)),
  )
  return match ? toView(option.entityType, match) : { reference: option, entries: [] }
}

/** Resolves one normalized choice against filtered catalogs without source-specific option lists. */
export function resolveClassChoiceOptions(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceCatalogs,
  saved: readonly CharacterClassChoiceOption[] = [],
): ClassChoiceOptionView[] {
  const filter = choice.optionFilter
  let resolved: ClassChoiceOptionView[] = []
  if (choice.options.length > 0) {
    resolved = choice.options.map((option) => resolveExplicitOption(option, catalogs))
  } else if (filter) {
    resolved = getCatalog(filter.entityType, catalogs)
      .filter((entity) => matchesFilter(entity, filter, catalogs.itemTypeByAbbr))
      .map((entity) => toView(filter.entityType, entity))
  }

  const byKey = new Map(
    resolved.map((option) => [getClassChoiceOptionKey(option.reference), option]),
  )
  for (const option of saved) {
    const key = getClassChoiceOptionKey(option)
    if (!byKey.has(key)) {
      byKey.set(key, {
        reference: {
          entityType: option.entityType,
          name: option.name,
          ...(option.source ? { source: option.source } : {}),
        },
        entries: [],
      })
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.reference.name.localeCompare(right.reference.name) ||
      normalized(left.reference.source).localeCompare(normalized(right.reference.source)),
  )
}

/** Excludes normalized choices already owned by the legacy progression-specific editors. */
export function getStandaloneClassChoices(classData: {
  normalizedRules?: { choices: NormalizedCharacterChoice[] }
  optionalfeatureProgression?: Array<{ name: string }>
  featProgression?: unknown
}): NormalizedCharacterChoice[] {
  const progressionLabels = new Set(
    [
      ...(classData.optionalfeatureProgression ?? []).map((progression) => progression.name),
      ...(Array.isArray(classData.featProgression)
        ? classData.featProgression.flatMap((progression) => {
            if (!progression || typeof progression !== 'object') return []
            const name = (progression as { name?: unknown }).name
            return typeof name === 'string' ? [name] : []
          })
        : []),
    ].map(normalized),
  )
  return (classData.normalizedRules?.choices ?? []).filter(
    (choice) =>
      choice.source.kind !== 'optional-feature-progression' &&
      !progressionLabels.has(normalized(choice.label)),
  )
}
