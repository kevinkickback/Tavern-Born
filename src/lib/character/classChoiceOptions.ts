import { featCategoryToFull, optFeatureTypeToFull } from '@/lib/5etools/classData'
import { DAMAGE_TYPE_LABELS } from '@/lib/5etools/constants'
import {
  buildCreatureChoiceSummary,
  type CreatureChoiceSummary,
} from '@/lib/5etools/creatureStatBlock'
import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import type {
  ClassFeature,
  Creature5e,
  Feat5e,
  Item5e,
  ItemMastery5e,
  OptionalFeatureLike,
  Raw5ePrereq,
  Subclass5e,
  SubclassFeature,
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
  presentation?: ClassChoiceOptionPresentation
  searchText?: string
}

type ClassChoiceOptionPresentation =
  | { kind: 'creature'; summary: CreatureChoiceSummary }
  | { kind: 'feature'; featureTypeLabels: string[]; level?: number }
  | { kind: 'feat'; categoryLabel?: string }
  | {
      kind: 'item'
      typeLabels: string[]
      propertyLabels: string[]
      rarity?: string
      damage?: string
      armorClass?: string
      range?: string
      attunement?: boolean | string
      weight?: number
    }

export function isClassChoiceOptionEligible(option: ClassChoiceOptionView): boolean {
  return option.availability === 'eligible'
}

export interface ClassChoiceCatalogs {
  classFeatures: readonly ClassFeature[]
  subclassFeatures: readonly SubclassFeature[]
  creatures: readonly Creature5e[]
  feats: readonly Feat5e[]
  items: readonly Item5e[]
  itemsBase: readonly Item5e[]
  itemMasteries: readonly ItemMastery5e[]
  optionalFeatures: readonly OptionalFeatureLike[]
  itemPropertyByAbbr: Readonly<Record<string, string>>
  itemTypeByAbbr: Readonly<Record<string, string>>
  weaponProficiencies: readonly string[]
}

type ChoiceCatalogEntity =
  | ClassFeature
  | SubclassFeature
  | Creature5e
  | Feat5e
  | Item5e
  | OptionalFeatureLike

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
  if (entityType === 'subclassFeature') return catalogs.subclassFeatures
  if (entityType === 'creature') return catalogs.creatures
  if (entityType === 'feat') return catalogs.feats
  if (entityType === 'item') return [...catalogs.itemsBase, ...catalogs.items]
  return catalogs.optionalFeatures
}

function getFilteredCatalog(
  filter: NormalizedChoiceOptionFilter,
  catalogs: ClassChoiceCatalogs,
): readonly ChoiceCatalogEntity[] {
  if (filter.entityType !== 'item') return getCatalog(filter.entityType, catalogs)
  const includesMagicItems =
    (filter.rarities?.length ?? 0) > 0 ||
    filter.anyOf?.some((candidate) => getFilteredCatalogIncludesMagicItems(candidate))
  return includesMagicItems ? [...catalogs.itemsBase, ...catalogs.items] : catalogs.itemsBase
}

function getFilteredCatalogIncludesMagicItems(filter: NormalizedChoiceOptionFilter): boolean {
  return (
    (filter.rarities?.length ?? 0) > 0 ||
    filter.anyOf?.some((candidate) => getFilteredCatalogIncludesMagicItems(candidate)) === true
  )
}

function getFeatureTypes(entity: ChoiceCatalogEntity): string[] {
  const raw = (entity as OptionalFeatureLike).featureType
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .map(normalized)
}

function getRawFeatureTypes(entity: ChoiceCatalogEntity): string[] {
  const raw = (entity as OptionalFeatureLike).featureType
  return (Array.isArray(raw) ? raw : [raw]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
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

function getItemPropertyLabels(
  item: Item5e,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
): string[] {
  return getItemPropertyReferences(item).flatMap((value) => {
    const code = value.split('|')[0]?.trim() ?? ''
    return [code, itemPropertyByAbbr[code.toUpperCase()]].filter((label): label is string =>
      Boolean(label),
    )
  })
}

function getItemPropertyReferences(item: Item5e): string[] {
  const raw = (item as Record<string, unknown>).property
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    const reference = record.property ?? record.abbreviation ?? record.name
    return typeof reference === 'string' ? [reference] : []
  })
}

function matchesAny(actual: readonly string[], expected: readonly string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const actualValues = new Set(actual.map(normalized))
  return expected.some((value) => actualValues.has(normalized(value)))
}

function matchesFilter(
  entity: ChoiceCatalogEntity,
  filter: NormalizedChoiceOptionFilter,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
  itemTypeByAbbr: Readonly<Record<string, string>>,
  weaponProficiencies: readonly string[],
  classLevel: number,
): boolean {
  if ((filter.minimumClassLevel ?? 1) > classLevel) return false
  if (
    filter.anyOf?.length &&
    !filter.anyOf.some((candidate) =>
      matchesFilter(
        entity,
        candidate,
        itemPropertyByAbbr,
        itemTypeByAbbr,
        weaponProficiencies,
        classLevel,
      ),
    )
  ) {
    return false
  }
  if (filter.source && normalized(entity.source) !== normalized(filter.source)) return false
  if (
    filter.entityType === 'creature' &&
    !matchesAny(getCreatureTypes(entity as Creature5e), filter.creatureTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    !matchesAny((entity as Creature5e).size ?? [], filter.sizes)
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    filter.challengeRatingMaximum !== undefined &&
    (getCreatureChallengeRating(entity as Creature5e) ?? Infinity) > filter.challengeRatingMaximum
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    filter.excludeSwarms &&
    isCreatureSwarm(entity as Creature5e)
  ) {
    return false
  }
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
    filter.excludedItemTypes?.length &&
    matchesAny(getItemTypeLabels(entity as Item5e, itemTypeByAbbr), filter.excludedItemTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.excludedItemProperties?.length &&
    matchesAny(
      getItemPropertyLabels(entity as Item5e, itemPropertyByAbbr),
      filter.excludedItemProperties,
    )
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    !matchesAny([(entity as Item5e).rarity ?? ''], filter.rarities)
  ) {
    return false
  }
  if (filter.entityType === 'item' && filter.excludeCursed && (entity as Item5e).curse) return false
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

function getCreatureTypes(creature: Creature5e): string[] {
  const type = creature.type
  if (typeof type === 'string') return [type]
  return typeof type?.type === 'string' ? [type.type] : []
}

function getCreatureChallengeRating(creature: Creature5e): number | undefined {
  const raw = typeof creature.cr === 'object' && creature.cr !== null ? creature.cr.cr : creature.cr
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return undefined
  const fraction = /^(\d+)\/(\d+)$/.exec(raw.trim())
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator > 0 ? Number(fraction[1]) / denominator : undefined
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : undefined
}

function isCreatureSwarm(creature: Creature5e): boolean {
  return typeof creature.type === 'object' && creature.type?.swarmSize != null
}

function creatureEntries(creature: Creature5e): unknown[] {
  if ((creature.entries?.length ?? 0) > 0) return creature.entries ?? []
  const summary = [
    creature.size?.length ? `Size: ${creature.size.join(', ')}` : undefined,
    getCreatureTypes(creature).length
      ? `Type: ${getCreatureTypes(creature).join(', ')}`
      : undefined,
    creature.cr !== undefined
      ? `Challenge Rating: ${typeof creature.cr === 'object' ? creature.cr.cr : creature.cr}`
      : undefined,
  ].filter((entry): entry is string => Boolean(entry))
  return [...summary, ...(creature.trait ?? []), ...(creature.action ?? [])]
}

function getItemTypeDisplayLabels(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string[] {
  const rawTypes = Array.isArray(item.type) ? item.type : [item.type]
  return rawTypes
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split('|')[0]?.trim() ?? '')
    .filter(Boolean)
    .map((code) => itemTypeByAbbr[code.toUpperCase()] ?? code)
}

function getItemPropertyDisplayLabels(
  item: Item5e,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
): string[] {
  return getItemPropertyReferences(item).map((value) => {
    const code = value.split('|')[0]?.trim() ?? value
    return itemPropertyByAbbr[code.toUpperCase()] ?? code
  })
}

function getItemPresentation(
  item: Item5e,
  catalogs: ClassChoiceCatalogs,
): Extract<ClassChoiceOptionPresentation, { kind: 'item' }> {
  const damageType = item.dmgType
    ? (DAMAGE_TYPE_LABELS[item.dmgType.toUpperCase()] ?? item.dmgType)
    : undefined
  return {
    kind: 'item',
    typeLabels: getItemTypeDisplayLabels(item, catalogs.itemTypeByAbbr),
    propertyLabels: getItemPropertyDisplayLabels(item, catalogs.itemPropertyByAbbr),
    ...(item.rarity && item.rarity.toLowerCase() !== 'none' ? { rarity: item.rarity } : {}),
    ...(item.dmg1 ? { damage: [item.dmg1, damageType].filter(Boolean).join(' ') } : {}),
    ...(item.ac !== undefined ? { armorClass: `AC ${item.ac}` } : {}),
    ...(item.range ? { range: item.range } : {}),
    ...(item.reqAttune ? { attunement: item.reqAttune } : {}),
    ...(item.weight !== undefined ? { weight: item.weight } : {}),
  }
}

function getPresentation(
  entityType: ChoiceOptionEntityType,
  entity: ChoiceCatalogEntity,
  catalogs: ClassChoiceCatalogs,
): ClassChoiceOptionPresentation {
  if (entityType === 'creature') {
    return { kind: 'creature', summary: buildCreatureChoiceSummary(entity as Creature5e) }
  }
  if (entityType === 'item') return getItemPresentation(entity as Item5e, catalogs)
  if (entityType === 'feat') {
    const category = (entity as Feat5e).category
    return {
      kind: 'feat',
      ...(category ? { categoryLabel: featCategoryToFull(category) } : {}),
    }
  }
  const featureTypeLabels =
    entityType === 'optionalFeature'
      ? getRawFeatureTypes(entity).map((type) => optFeatureTypeToFull(type))
      : []
  const level =
    entityType === 'classFeature' || entityType === 'subclassFeature'
      ? (entity as ClassFeature | SubclassFeature).level
      : undefined
  return {
    kind: 'feature',
    featureTypeLabels,
    ...(level !== undefined ? { level } : {}),
  }
}

function getOptionSearchText(
  entity: ChoiceCatalogEntity,
  presentation: ClassChoiceOptionPresentation,
): string {
  const terms = [entity.name, entity.source]
  if (presentation.kind === 'creature') {
    const { summary } = presentation
    terms.push(
      summary.subtitle,
      summary.challenge,
      summary.speed,
      ...summary.speedModes,
      ...summary.speedModes.map((mode) => (mode === 'fly' ? 'flight flying' : mode)),
      ...summary.traits.map((trait) => trait.name),
      ...summary.actions.map((action) => action.name),
    )
  } else if (presentation.kind === 'feature') {
    terms.push(...presentation.featureTypeLabels)
  } else if (presentation.kind === 'feat') {
    terms.push(presentation.categoryLabel)
  } else {
    terms.push(
      ...presentation.typeLabels,
      ...presentation.propertyLabels,
      presentation.rarity,
      presentation.damage,
      presentation.armorClass,
      presentation.range,
    )
  }
  return terms.filter((term): term is string => Boolean(term)).join(' ')
}

function toView(
  entityType: ChoiceOptionEntityType,
  entity: ChoiceCatalogEntity,
  catalogs: ClassChoiceCatalogs,
  availability: ClassChoiceOptionView['availability'] = 'eligible',
): ClassChoiceOptionView {
  const item = entityType === 'item' ? (entity as Item5e) : undefined
  const creature = entityType === 'creature' ? (entity as Creature5e) : undefined
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
  const presentation = getPresentation(entityType, entity, catalogs)
  return {
    availability,
    reference: {
      entityType,
      name: entity.name,
      ...(entity.source ? { source: entity.source } : {}),
    },
    entries: creature
      ? creatureEntries(creature)
      : Array.isArray(entity.entries)
        ? entity.entries
        : [],
    presentation,
    searchText: getOptionSearchText(entity, presentation),
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
        availability: 'retained',
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
  classLevel = 20,
): ClassChoiceOptionView[] {
  const filter = choice.optionFilter
  const resolved: ClassChoiceOptionView[] = []
  if (choice.options.length > 0) {
    resolved.push(
      ...choice.options
        .filter((option) => (option.minimumClassLevel ?? 1) <= classLevel)
        .map((option) => resolveExplicitOption(option, catalogs)),
    )
  }
  if (filter) {
    resolved.push(
      ...getFilteredCatalog(filter, catalogs)
        .filter((entity) =>
          matchesFilter(
            entity,
            filter,
            catalogs.itemPropertyByAbbr,
            catalogs.itemTypeByAbbr,
            catalogs.weaponProficiencies,
            classLevel,
          ),
        )
        .map((entity) => toView(filter.entityType, entity, catalogs)),
    )
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

function getAllCharacterClassChoices(
  classData: { normalizedRules?: { choices: NormalizedCharacterChoice[] } },
  subclass: Pick<Subclass5e, 'normalizedRules'> | undefined,
): NormalizedCharacterChoice[] {
  return [
    ...getStandaloneClassChoices(classData),
    ...(subclass?.normalizedRules?.choices ?? []),
  ].sort((left, right) => left.level - right.level || left.id.localeCompare(right.id))
}

function getFeatureVariantFamilyChoices(
  choices: readonly NormalizedCharacterChoice[],
): NormalizedCharacterChoice[] {
  const replacedFeatureNames = new Set(
    choices.flatMap((choice) => {
      const name = normalized(choice.featureVariant?.replacesFeatureName)
      return name ? [name] : []
    }),
  )
  return choices.filter(
    (choice) =>
      choice.featureVariant !== undefined ||
      replacedFeatureNames.has(normalized(choice.owner.featureName)),
  )
}

/** Returns only replacement choices and the original choices they supersede. */
export function getCharacterClassFeatureVariantChoices(
  classData: { normalizedRules?: { choices: NormalizedCharacterChoice[] } },
  subclass: Pick<Subclass5e, 'normalizedRules'> | undefined,
): NormalizedCharacterChoice[] {
  return [
    ...getFeatureVariantFamilyChoices(getStandaloneClassChoices(classData)),
    ...getFeatureVariantFamilyChoices(subclass?.normalizedRules?.choices ?? []),
  ].sort((left, right) => left.level - right.level || left.id.localeCompare(right.id))
}

function includeFeatureVariantChoice(
  choice: NormalizedCharacterChoice,
  choices: readonly NormalizedCharacterChoice[],
  includeVariants: boolean,
): boolean {
  if (choice.featureVariant) return includeVariants
  if (!includeVariants) return true
  const featureName = normalized(choice.owner.featureName)
  return !choices.some(
    (candidate) =>
      candidate.featureVariant &&
      normalized(candidate.featureVariant.replacesFeatureName) === featureName,
  )
}

export function getCharacterClassChoices(
  classData: { normalizedRules?: { choices: NormalizedCharacterChoice[] } },
  subclass: Pick<Subclass5e, 'normalizedRules'> | undefined,
  includeVariants: boolean,
): NormalizedCharacterChoice[] {
  const classChoices = getStandaloneClassChoices(classData)
  const subclassChoices = subclass?.normalizedRules?.choices ?? []
  return getAllCharacterClassChoices(classData, subclass).filter((choice) =>
    includeFeatureVariantChoice(
      choice,
      choice.owner.type === 'subclass' ? subclassChoices : classChoices,
      includeVariants,
    ),
  )
}

export function getCharacterClassChoiceDiagnostics(
  classData: {
    normalizedRules?: { choiceDiagnostics: import('@/types/classRules').ClassChoiceDiagnostic[] }
  },
  subclass: Pick<Subclass5e, 'normalizedRules'> | undefined,
  includeVariants: boolean,
): import('@/types/classRules').ClassChoiceDiagnostic[] {
  const includeDiagnostic = (
    diagnostic: import('@/types/classRules').ClassChoiceDiagnostic,
    diagnostics: readonly import('@/types/classRules').ClassChoiceDiagnostic[],
  ) => {
    if (diagnostic.featureVariant) return includeVariants
    if (!includeVariants) return true
    const featureName = normalized(diagnostic.featureName)
    return !diagnostics.some(
      (candidate) =>
        candidate.featureVariant &&
        normalized(candidate.featureVariant.replacesFeatureName) === featureName,
    )
  }
  const classDiagnostics = classData.normalizedRules?.choiceDiagnostics ?? []
  const subclassDiagnostics = subclass?.normalizedRules?.choiceDiagnostics ?? []
  return [
    ...classDiagnostics.filter((diagnostic) => includeDiagnostic(diagnostic, classDiagnostics)),
    ...subclassDiagnostics.filter((diagnostic) =>
      includeDiagnostic(diagnostic, subclassDiagnostics),
    ),
  ]
}

export function collectSubclassFeatures(subclass: Subclass5e | undefined): SubclassFeature[] {
  const features = new Map<string, SubclassFeature>()
  const visit = (feature: SubclassFeature | undefined) => {
    if (!feature) return
    const key = `${normalized(feature.name)}|${normalized(feature.source)}`
    if (features.has(key)) return
    features.set(key, feature)
    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }
      if (!value || typeof value !== 'object') return
      const record = value as Record<string, unknown>
      if (record.type === 'refSubclassFeature' && record.feature) {
        visit(record.feature as SubclassFeature)
      }
      if (Array.isArray(record.entries)) walk(record.entries)
    }
    walk(feature.entries)
  }
  for (const feature of subclass?.subclassFeatures ?? []) {
    if (typeof feature === 'object') visit(feature)
  }
  for (const reference of subclass?.subclassFeatureRefs ?? []) visit(reference.feature)
  for (const group of subclass?.levelFeatures ?? []) group.features.forEach(visit)
  return [...features.values()]
}
