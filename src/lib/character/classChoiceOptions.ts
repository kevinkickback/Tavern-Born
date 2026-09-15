import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type {
  ClassFeature,
  Feat5e,
  Item5e,
  OptionalFeatureLike,
  Raw5ePrereq,
} from '@/types/5etools'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
} from '@/types/character'
import type {
  ChoiceOptionEntityType,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'

export interface ClassChoiceOptionView {
  reference: NormalizedChoiceOptionReference
  entries: unknown[]
  prerequisite?: Raw5ePrereq[]
}

export interface ClassChoiceCatalogs {
  classFeatures: readonly ClassFeature[]
  feats: readonly Feat5e[]
  items: readonly Item5e[]
  optionalFeatures: readonly OptionalFeatureLike[]
  itemTypeByAbbr: Readonly<Record<string, string>>
  weaponProficiencies: readonly string[]
}

function isLegacyChoiceTag(
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
): boolean {
  return (ledger.features[normalizeKey(option.name)] ?? []).some(
    (tag) =>
      tag.sourceType === 'class' &&
      tag.sourceName === choice.owner.name &&
      tag.grantType === 'choice' &&
      tag.grantVariant === undefined &&
      (!option.source || (tag.sourceRef ?? '') === option.source),
  )
}

/** Projects legacy optional-feature grants into the normalized choice UI until the next save. */
export function getLegacyClassChoiceSelection(
  choice: NormalizedCharacterChoice,
  options: readonly ClassChoiceOptionView[],
  character: Pick<Character, 'classFeatChoices' | 'provenance'>,
): CharacterClassChoiceSelection | undefined {
  let selected: CharacterClassChoiceOption[] = []
  if (choice.kind === 'optional-feature' && choice.source.kind === 'optional-feature-progression') {
    const ledger = character.provenance
    if (!ledger) return undefined
    selected = options
      .map((option) => option.reference)
      .filter((option) => isLegacyChoiceTag(ledger, choice, option))
      .map((option) => ({ ...option, slotLevel: choice.level }))
  } else if (choice.kind === 'feat') {
    const categories = new Set((choice.optionFilter?.categories ?? []).map(normalized))
    const legacy = character.classFeatChoices?.find(
      (entry) =>
        entry.id !== choice.id &&
        entry.className === choice.owner.name &&
        (entry.classSource ?? '') === choice.owner.source &&
        normalized(entry.progressionName) === normalized(choice.label) &&
        entry.categories.length === categories.size &&
        entry.categories.every((category) => categories.has(normalized(category))),
    )
    if (!legacy) return undefined
    const availableKeys = new Set(
      options.map((option) => getClassChoiceOptionKey(option.reference)),
    )
    selected = legacy.feats
      .map((feat) => ({
        entityType: 'feat' as const,
        name: feat.name,
        source: feat.source,
        slotLevel: feat.classLevel ?? choice.level,
      }))
      .filter((option) => availableKeys.has(getClassChoiceOptionKey(option)))
  } else {
    return undefined
  }
  if (selected.length === 0) return undefined
  return {
    choiceId: choice.id,
    label: choice.label,
    kind: choice.kind,
    className: choice.owner.name,
    classSource: choice.owner.source,
    classLevel: choice.level,
    selected,
  }
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
    filter.requiresProficiency &&
    !isProficientWithWeapon(weaponProficiencies, entity as Item5e)
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
    ...('prerequisite' in entity && Array.isArray(entity.prerequisite)
      ? { prerequisite: entity.prerequisite }
      : {}),
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
      .filter((entity) =>
        matchesFilter(entity, filter, catalogs.itemTypeByAbbr, catalogs.weaponProficiencies),
      )
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

/** Returns normalized class choices for the shared class-choice workflow. */
export function getStandaloneClassChoices(classData: {
  normalizedRules?: { choices: NormalizedCharacterChoice[] }
}): NormalizedCharacterChoice[] {
  return classData.normalizedRules?.choices ?? []
}
