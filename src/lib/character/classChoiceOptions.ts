import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import type {
  ClassFeature,
  Feat5e,
  Item5e,
  ItemMastery5e,
  OptionalFeatureLike,
  Raw5ePrereq,
} from '@/types/5etools'
import type { CharacterClassChoiceOption } from '@/types/character'
import type {
  ChoiceOptionEntityType,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'

export interface ClassChoiceOptionView {
  reference: NormalizedChoiceOptionReference
  availability: 'eligible' | 'retained'
  entries: unknown[]
  masteries?: Array<{ name: string; source?: string; entries: unknown[] }>
  weaponCategory?: string
  weaponRange?: 'Melee' | 'Ranged'
  prerequisite?: Raw5ePrereq[]
}

export function isClassChoiceOptionEligible(option: ClassChoiceOptionView): boolean {
  return option.availability === 'eligible'
}

export interface ClassChoiceCatalogs {
  classFeatures: readonly ClassFeature[]
  feats: readonly Feat5e[]
  items: readonly Item5e[]
  itemsBase: readonly Item5e[]
  itemMasteries: readonly ItemMastery5e[]
  optionalFeatures: readonly OptionalFeatureLike[]
  itemTypeByAbbr: Readonly<Record<string, string>>
  weaponProficiencies: readonly string[]
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
  if (entityType === 'item') return [...catalogs.itemsBase, ...catalogs.items]
  return catalogs.optionalFeatures
}

function getFilteredCatalog(
  entityType: ChoiceOptionEntityType,
  catalogs: ClassChoiceCatalogs,
): readonly ChoiceCatalogEntity[] {
  if (entityType === 'item') return catalogs.itemsBase
  return getCatalog(entityType, catalogs)
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
  weaponProficiencies: readonly string[],
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
  if (
    filter.entityType === 'item' &&
    !matchesAny(
      getNormalizedItemTraits(entity as Item5e, itemTypeByAbbr).weaponRanges,
      filter.weaponRanges,
    )
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.requiresProficiency &&
    !isProficientWithWeapon(weaponProficiencies, entity as Item5e)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.requiresMastery &&
    ((entity as Item5e).mastery?.length ?? 0) === 0
  ) {
    return false
  }
  return true
}

function toView(
  entityType: ChoiceOptionEntityType,
  entity: ChoiceCatalogEntity,
  catalogs: ClassChoiceCatalogs,
  availability: ClassChoiceOptionView['availability'] = 'eligible',
): ClassChoiceOptionView {
  const item = entityType === 'item' ? (entity as Item5e) : undefined
  const weaponRange = item
    ? getNormalizedItemTraits(item, catalogs.itemTypeByAbbr).weaponRanges[0]
    : undefined
  const masteries =
    entityType === 'item'
      ? (item?.mastery ?? []).flatMap((reference) => {
          const [rawName, rawSource] = reference.split('|')
          const name = rawName?.trim()
          if (!name) return []
          const source = rawSource?.trim()
          const definition = catalogs.itemMasteries.find(
            (mastery) =>
              normalized(mastery.name) === normalized(name) &&
              (!source || normalized(mastery.source) === normalized(source)),
          )
          return [
            {
              name,
              ...(source ? { source } : {}),
              entries: definition?.entries ?? [],
            },
          ]
        })
      : []
  return {
    availability,
    reference: {
      entityType,
      name: entity.name,
      ...(entity.source ? { source: entity.source } : {}),
    },
    entries: Array.isArray(entity.entries) ? entity.entries : [],
    ...(masteries.length > 0 ? { masteries } : {}),
    ...(item?.weaponCategory ? { weaponCategory: item.weaponCategory } : {}),
    ...(weaponRange
      ? { weaponRange: weaponRange === 'melee' ? ('Melee' as const) : ('Ranged' as const) }
      : {}),
    ...('prerequisite' in entity && Array.isArray(entity.prerequisite)
      ? { prerequisite: entity.prerequisite }
      : {}),
  }
}

function resolveExplicitOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceCatalogs,
  availability: ClassChoiceOptionView['availability'] = 'eligible',
): ClassChoiceOptionView {
  const match = getCatalog(option.entityType, catalogs).find(
    (entity) =>
      normalized(entity.name) === normalized(option.name) &&
      (!option.source || normalized(entity.source) === normalized(option.source)),
  )
  return match
    ? toView(option.entityType, match, catalogs, availability)
    : {
        availability,
        reference: {
          entityType: option.entityType,
          name: option.name,
          ...(option.source ? { source: option.source } : {}),
        },
        entries: [],
      }
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
    resolved = getFilteredCatalog(filter.entityType, catalogs)
      .filter((entity) =>
        matchesFilter(entity, filter, catalogs.itemTypeByAbbr, catalogs.weaponProficiencies),
      )
      .map((entity) => toView(filter.entityType, entity, catalogs))
  }

  const byKey = new Map(
    resolved.map((option) => [getClassChoiceOptionKey(option.reference), option]),
  )
  for (const option of saved) {
    const key = getClassChoiceOptionKey(option)
    if (!byKey.has(key)) {
      byKey.set(key, resolveExplicitOption(option, catalogs, 'retained'))
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.reference.name.localeCompare(right.reference.name) ||
      normalized(left.reference.source).localeCompare(normalized(right.reference.source)),
  )
}

/** Returns normalized class choices for the shared class-choice workflow. */
export function getStandaloneClassChoices(classData: {
  normalizedRules?: { choices: NormalizedCharacterChoice[] }
}): NormalizedCharacterChoice[] {
  return classData.normalizedRules?.choices ?? []
}
