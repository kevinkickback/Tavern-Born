import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'

export {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
  collectSubclassFeatures,
  indexSubclassFeatureTargets,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'

import { getCurrentCannyChoices, normalizeCannyChoices } from '@/lib/5etools/cannyChoices'
import { featCategoryToFull, optFeatureTypeToFull } from '@/lib/5etools/classData'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import {
  getCurrentClassProficiencyChoices,
  normalizeClassProficiencyChoices,
} from '@/lib/5etools/classProficiencyChoices'
import {
  decodeClassProficiencyChoiceId,
  isClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import { DAMAGE_TYPE_LABELS } from '@/lib/5etools/constants'
import {
  buildCreatureChoiceSummary,
  type CreatureChoiceSummary,
} from '@/lib/5etools/creatureStatBlock'
import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import {
  type FeatureTableDefinition,
  type FeatureTableOption,
  resolveFeatureTableOption,
} from '@/lib/5etools/featureTableOptions'
import { getItemPropertyLabel, getItemPropertyUid } from '@/lib/5etools/itemProperties'
import {
  hasNaturalExplorerGrant,
  resolveNaturalExplorerOption,
  type SourceGroupOption,
} from '@/lib/5etools/naturalExplorerChoices'
import {
  DEFT_EXPLORER_TARGET,
  decodeNaturalExplorerChoiceId,
  NATURAL_EXPLORER_TARGET,
} from '@/lib/5etools/naturalExplorerIdentity'
import { getNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { getActiveRequiredSetupDiagnostics } from '@/lib/5etools/requiredSetupDiagnostics'
import { resolveStormFeature } from '@/lib/5etools/stormAuraChoices'
import {
  isStormAuraChoiceId,
  STORM_TARGETS,
  stormFeatureRef,
} from '@/lib/5etools/stormAuraIdentity'
import { getSubclassProficiencyDiagnostics } from '@/lib/5etools/subclassProficiencyChoices'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import {
  getNormalizedItemTraits,
  isSelectableEquipmentItem,
} from '@/lib/calculations/itemClassification'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import type {
  Class5e,
  ClassFeature,
  Creature5e,
  Feat5e,
  Item5e,
  ItemMastery5e,
  ItemPropertyReference,
  OptionalFeatureLike,
  Raw5ePrereq,
  Subclass5e,
  SubclassFeature,
} from '@/types/5etools'
import type { Character, CharacterClassChoiceOption } from '@/types/character'
import type {
  ChoiceOptionEntityType,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  getClassChoiceFeatureTarget,
  getClassChoiceOptionKey,
  getFeatureOwnerKey,
} from './classChoiceIdentity'
import { getCurrentOwnedProficiencyCandidates } from './classProficiencyAuthority'
import { resolveClassProficiencyOptions } from './classProficiencyOptions'
import { getOptionalClassPoolSection } from './optionalClassAdoptionRules'
import {
  createOptionalClassFeatureActivity,
  type OptionalClassFeatureActivity,
} from './optionalClassFeatureActivity'

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
  featureOption?: { damageType: string }
  sourceGroup?: { group: string }
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

export interface ClassChoiceCatalogs extends ClassChoiceFeatureCatalogs {
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

/** Minimal explicit feature authority shared by literal command, state and picker paths. */
export function createClassChoiceCatalogs(
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassChoiceCatalogs {
  return {
    creatures: [],
    feats: [],
    items: [],
    itemsBase: [],
    itemMasteries: [],
    optionalFeatures: [],
    itemPropertyByAbbr: {},
    itemTypeByAbbr: {},
    weaponProficiencies: [],
    classFeatures: [],
    subclassFeatures: [],
    ...catalogs,
  }
}

type ChoiceCatalogEntity =
  | ClassFeature
  | SubclassFeature
  | Creature5e
  | Feat5e
  | Item5e
  | OptionalFeatureLike
  | FeatureTableOption
  | SourceGroupOption

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export { getClassChoiceOptionKey } from './classChoiceIdentity'

function getCatalog(
  entityType: ChoiceOptionEntityType,
  catalogs: Pick<
    ClassChoiceCatalogs,
    | 'classFeatures'
    | 'subclassFeatures'
    | 'creatures'
    | 'feats'
    | 'items'
    | 'itemsBase'
    | 'optionalFeatures'
  > &
    Pick<ClassChoiceFeatureCatalogs, 'subclassFeatureCandidates'>,
): readonly ChoiceCatalogEntity[] {
  if (entityType === 'featureOption' || entityType === 'proficiency') return []
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
  const candidates = includesMagicItems
    ? [...catalogs.itemsBase, ...catalogs.items]
    : catalogs.itemsBase
  return candidates.filter(isSelectableEquipmentItem)
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
    const uid = getItemPropertyUid(value)
    const code = uid.split('|')[0]?.trim() ?? ''
    return [code, getItemPropertyLabel(uid, itemPropertyByAbbr)].filter((label): label is string =>
      Boolean(label),
    )
  })
}

function getItemPropertyReferences(item: Item5e): ItemPropertyReference[] {
  const raw = (item as Record<string, unknown>).property
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    const reference = record.uid ?? record.property ?? record.abbreviation ?? record.name
    if (typeof reference !== 'string') return []
    return [typeof record.note === 'string' ? { uid: reference, note: record.note } : reference]
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

export function getCreatureChoiceEntries(creature: Creature5e): unknown[] {
  const summary = [
    creature.size?.length ? `Size: ${creature.size.join(', ')}` : undefined,
    getCreatureTypes(creature).length
      ? `Type: ${getCreatureTypes(creature).join(', ')}`
      : undefined,
    creature.cr !== undefined
      ? `Challenge Rating: ${typeof creature.cr === 'object' ? creature.cr.cr : creature.cr}`
      : undefined,
  ].filter((entry): entry is string => Boolean(entry))
  return [
    ...(creature.entries?.length ? creature.entries : summary),
    ...(['trait', 'action', 'bonus', 'reaction'] as const).flatMap((kind) =>
      (creature[kind] ?? []).map((entry) => ({
        type: 'entries',
        name: entry.name,
        entries: entry.entries ?? [],
      })),
    ),
  ]
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
  return getItemPropertyReferences(item).map((value) =>
    getItemPropertyLabel(value, itemPropertyByAbbr),
  )
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

function featureReference(
  entityType: ChoiceOptionEntityType,
  entity: ChoiceCatalogEntity,
): { ref?: string } {
  const target =
    entityType === 'classFeature'
      ? getClassFeatureIdentity(entity)
      : entityType === 'subclassFeature'
        ? getSubclassFeatureIdentity(entity)
        : undefined
  return target ? { ref: target.split('|').slice(1).join('|') } : {}
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
      ...featureReference(entityType, entity),
    },
    entries: creature
      ? getCreatureChoiceEntries(creature)
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

/** Literal rows resolve only through complete candidates retained in the filtered owner bundle. */
export function resolveFeatureOptionEntity(
  option: NormalizedChoiceOptionReference,
  catalogs: Pick<
    ClassChoiceFeatureCatalogs,
    'classFeatures' | 'classFeatureCandidates' | 'subclassFeatures' | 'subclassFeatureCandidates'
  >,
  cache?: Map<string, FeatureTableDefinition | undefined>,
): FeatureTableOption | SourceGroupOption | undefined {
  const target = decodeFeatureOptionReference(option)
  if (target?.format === 'source-group') return resolveNaturalExplorerOption(option, catalogs)
  if (!target || target.kind !== 'subclassFeature') return undefined
  const candidates =
    catalogs.subclassFeatureCandidates !== undefined
      ? (catalogs.subclassFeatureCandidates.get(target.parentIdentity) ?? [])
      : catalogs.subclassFeatures.filter(
          (feature) => getSubclassFeatureIdentity(feature) === target.parentIdentity,
        )
  return resolveFeatureTableOption(option, candidates, cache)
}

export function resolveClassChoiceOptionEntity(
  option: NormalizedChoiceOptionReference,
  catalogs: Parameters<typeof getCatalog>[1],
  cache?: Map<string, FeatureTableDefinition | undefined>,
): ChoiceCatalogEntity | undefined {
  if (option.entityType === 'featureOption')
    return resolveFeatureOptionEntity(option, catalogs, cache)
  if (option.entityType === 'classFeature' || option.entityType === 'subclassFeature') {
    return resolveClassChoiceFeatureEntity(option, catalogs)
  }
  return getCatalog(option.entityType, catalogs).find(
    (entity) =>
      normalized(entity.name) === normalized(option.name) &&
      (!option.source || normalized(entity.source) === normalized(option.source)),
  )
}

/** Feature choices resolve only within their explicitly supplied target catalog. */
export function resolveClassChoiceFeatureEntity(
  option: NormalizedChoiceOptionReference,
  catalogs: Pick<
    ClassChoiceFeatureCatalogs,
    'classFeatures' | 'subclassFeatures' | 'subclassFeatureCandidates'
  >,
): ClassFeature | SubclassFeature | undefined {
  const target = getClassChoiceFeatureTarget(option)
  if (!target) return undefined
  if (option.entityType === 'classFeature') {
    return catalogs.classFeatures.find((feature) => getClassFeatureIdentity(feature) === target)
  }
  if (option.entityType !== 'subclassFeature') return undefined
  if (STORM_TARGETS.has(target)) {
    const candidates =
      catalogs.subclassFeatureCandidates !== undefined
        ? (catalogs.subclassFeatureCandidates.get(target) ?? [])
        : catalogs.subclassFeatures.filter(
            (feature) => getSubclassFeatureIdentity(feature) === target,
          )
    return resolveStormFeature(target, candidates)
  }
  const matches = catalogs.subclassFeatures.filter(
    (feature) => getSubclassFeatureIdentity(feature) === target,
  )
  return matches.length === 1 ? matches[0] : undefined
}

function resolveExplicitOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceCatalogs,
  availability: ClassChoiceOptionView['availability'] = 'eligible',
  cache?: Map<string, FeatureTableDefinition | undefined>,
): ClassChoiceOptionView {
  const match = resolveClassChoiceOptionEntity(option, catalogs, cache)
  if (option.entityType === 'featureOption' && match) {
    return {
      availability,
      reference: option,
      entries: match.entries ?? [],
      presentation: {
        kind: 'feature',
        featureTypeLabels: ['group' in match ? 'Favored terrain' : 'Dragon ancestry'],
      },
      ...('group' in match
        ? { sourceGroup: { group: String(match.group) } }
        : { featureOption: { damageType: (match as FeatureTableOption).damageType } }),
      searchText: `${option.name} ${'damageType' in match ? match.damageType : ''}`,
    }
  }
  return match
    ? toView(option.entityType, match, catalogs, availability)
    : {
        availability: 'retained',
        reference: {
          entityType: option.entityType,
          name: option.name,
          ...(option.source ? { source: option.source } : {}),
          ...(option.ref ? { ref: option.ref } : {}),
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
  character?: Character,
): ClassChoiceOptionView[] {
  if (choice.kind === 'proficiency' || isClassProficiencyChoiceId(choice.id))
    return resolveClassProficiencyOptions(choice, catalogs, saved, character)
  if (catalogs.subclassTargets) {
    const owner =
      choice.owner.type === 'subclass'
        ? getFeatureOwnerKey(
            choice.owner.name,
            choice.owner.source,
            choice.owner.subclassName,
            choice.owner.subclassSource,
          )
        : undefined
    catalogs = { ...catalogs, ...scopeClassChoiceFeatureCatalogs(catalogs, owner) }
  }
  if (
    isStormAuraChoiceId(choice.id) &&
    !['Path of the Storm Herald', 'Storm Aura'].every((name) =>
      resolveClassChoiceFeatureEntity(
        { entityType: 'subclassFeature', name, source: 'XGE', ref: stormFeatureRef(name, 3) },
        catalogs,
      ),
    )
  ) {
    return [
      ...new Map(
        [...choice.options, ...saved].map((reference) => [
          getClassChoiceOptionKey(reference),
          { reference, availability: 'retained' as const, entries: [] },
        ]),
      ).values(),
    ]
  }
  const literal = decodeNaturalExplorerChoiceId(choice.id)
  if (
    isFeatureLiteralChoiceId(choice.id) &&
    (!literal || !getNaturalExplorerSources(catalogs).get(literal.grant))
  ) {
    return [
      ...new Map(
        [...choice.options, ...saved].map((reference) => [
          getClassChoiceOptionKey(reference),
          { reference, availability: 'retained' as const, entries: [] },
        ]),
      ).values(),
    ]
  }
  const filter = choice.optionFilter
  const tableDefinitions = new Map<string, FeatureTableDefinition | undefined>()
  const resolved: ClassChoiceOptionView[] = []
  if (choice.options.length > 0) {
    resolved.push(
      ...choice.options
        .filter((option) => (option.minimumClassLevel ?? 1) <= classLevel)
        .map((option) => resolveExplicitOption(option, catalogs, 'eligible', tableDefinitions)),
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

  const poolSection = getOptionalClassPoolSection(choice)
  const activity = character && createOptionalClassFeatureActivity(character, catalogs)
  const poolCounts = new Map<string, number>()
  if (poolSection)
    for (const row of catalogs.optionalFeatures) {
      const key = getClassChoiceOptionKey({
        entityType: 'optionalFeature',
        name: row.name,
        source: row.source,
      })
      poolCounts.set(key, (poolCounts.get(key) ?? 0) + 1)
    }
  const byKey = new Map(
    resolved
      .filter((option) => {
        if (
          !poolSection ||
          option.reference.entityType !== 'optionalFeature' ||
          normalized(option.reference.source) !== normalized(poolSection.source)
        )
          return true
        if (!activity?.option(choice, option.reference)) return false
        const key = getClassChoiceOptionKey(option.reference)
        const count = poolCounts.get(key) ?? 0
        const candidateCount =
          catalogs.optionalFeatureCandidates !== undefined
            ? (catalogs.optionalFeatureCandidates.get(key) ?? []).length
            : count
        return count === 1 && candidateCount === 1
      })
      .map((option) => [getClassChoiceOptionKey(option.reference), option]),
  )
  for (const option of saved) {
    const key = getClassChoiceOptionKey(option)
    if (!byKey.has(key)) {
      byKey.set(key, resolveExplicitOption(option, catalogs, 'retained', tableDefinitions))
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

/** Source-only candidates include both sides; no permission or character intent is inferred. */
export function getClassChoiceCandidates(
  classData: {
    name?: string
    source?: string
    classFeatureRefs?: Class5e['classFeatureRefs']
    normalizedRules?: { choices: NormalizedCharacterChoice[] }
  },
  subclass:
    | (Pick<Subclass5e, 'normalizedRules'> & Partial<Pick<Subclass5e, 'name' | 'source'>>)
    | undefined,
  catalogs?: ClassChoiceFeatureCatalogs,
): NormalizedCharacterChoice[] {
  const declarations = collectUnconditionalFeatureReferences(
    classData.classFeatureRefs ?? [],
    'classFeature',
  )
  const ordinary = getAllCharacterClassChoices(classData, subclass).filter((choice) => {
    if (choice.kind === 'proficiency' || isClassProficiencyChoiceId(choice.id)) {
      return false
    }
    if (isFeatureLiteralChoiceId(choice.id)) {
      const relation = decodeNaturalExplorerChoiceId(choice.id)
      const grants = declarations.filter((row) => row.target === relation?.grant)
      return (
        !!relation &&
        normalized(classData.name) === normalized(choice.owner.name) &&
        normalized(classData.source) === normalized(choice.owner.source) &&
        hasNaturalExplorerGrant(declarations, NATURAL_EXPLORER_TARGET) &&
        hasNaturalExplorerGrant(declarations, relation.grant) &&
        Math.min(...grants.map((row) => row.level)) === choice.level
      )
    }
    return true
  })
  const canonical =
    classData.name && classData.source
      ? getCurrentOwnedProficiencyCandidates(
          {
            name: classData.name,
            source: classData.source,
            classFeatureRefs: classData.classFeatureRefs,
          },
          true,
          catalogs,
          subclass?.name && subclass.source
            ? { name: subclass.name, source: subclass.source }
            : undefined,
        )
      : []
  return [...ordinary, ...canonical].sort(
    (left, right) => left.level - right.level || left.id.localeCompare(right.id),
  )
}

export function getCharacterClassChoices(
  classData: Parameters<typeof getClassChoiceCandidates>[0],
  subclass: Parameters<typeof getClassChoiceCandidates>[1],
  activity: OptionalClassFeatureActivity,
  catalogs?: ClassChoiceFeatureCatalogs,
): NormalizedCharacterChoice[] {
  if (activity.catalogs !== catalogs)
    throw new RangeError('Class activity requires the current source catalog.')
  return getClassChoiceCandidates(classData, subclass, catalogs).filter(activity.choice)
}

/** Source-side audit query only. This boolean never decides a character's required setup. */
export function getClassChoiceDiagnosticCandidateSide(
  classData: {
    name?: string
    source?: string
    classFeatureRefs?: Class5e['classFeatureRefs']
    normalizedRules?: { choiceDiagnostics: import('@/types/classRules').ClassChoiceDiagnostic[] }
  },
  subclass:
    | (Pick<Subclass5e, 'normalizedRules'> & Partial<Pick<Subclass5e, 'name' | 'source'>>)
    | undefined,
  includeVariants: boolean,
  catalogs?: Pick<
    ClassChoiceFeatureCatalogs,
    'classFeatures' | 'classFeatureCandidates' | 'ambiguousClassFeatureTargets'
  > &
    Partial<ClassChoiceFeatureCatalogs>,
): import('@/types/classRules').ClassChoiceDiagnostic[] {
  const known = new Set(
    getActiveRequiredSetupDiagnostics(
      [
        ...(classData.normalizedRules?.choiceDiagnostics ?? []),
        ...(subclass?.normalizedRules?.choiceDiagnostics ?? []),
      ],
      classData,
      includeVariants,
      catalogs?.classFeatures,
      catalogs?.ambiguousClassFeatureTargets,
      catalogs?.classFeatureCandidates,
    ),
  )
  const includeDiagnostic = (
    diagnostic: import('@/types/classRules').ClassChoiceDiagnostic,
    diagnostics: readonly import('@/types/classRules').ClassChoiceDiagnostic[],
  ) => {
    if (diagnostic.requiredChoice) {
      const target =
        diagnostic.requiredChoice.target.entityType === 'classFeature' &&
        getClassFeatureIdentity(
          decodeClassFeatureReference(diagnostic.requiredChoice.target.ref ?? ''),
        )
      const rule = target && classProficiencyRule(target)
      if (rule && target !== DEFT_EXPLORER_TARGET) return includeVariants || !rule.optional
      return known.has(diagnostic)
    }
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
  const subclassProficiencyDiagnostics =
    classData.name && classData.source && subclass?.name && subclass.source
      ? getSubclassProficiencyDiagnostics(
          {
            type: 'subclass',
            name: classData.name,
            source: classData.source,
            subclassName: subclass.name,
            subclassSource: subclass.source,
          },
          getCurrentOwnedProficiencyCandidates(
            {
              name: classData.name,
              source: classData.source,
              classFeatureRefs: classData.classFeatureRefs,
            },
            includeVariants,
            catalogs
              ? { ...catalogs, subclassFeatures: catalogs.subclassFeatures ?? [] }
              : undefined,
            { name: subclass.name, source: subclass.source },
          ),
        )
      : []
  const canny =
    classData.name && classData.source && includeVariants
      ? normalizeCannyChoices(
          { type: 'class', name: classData.name, source: classData.source },
          collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
        )
      : undefined
  const cannyDiagnostics = canny?.diagnostics ?? []
  const generalDiagnostics: import('@/types/classRules').ClassChoiceDiagnostic[] = []
  const seenProficiencyDiagnostics = new Set<string>()
  if (classData.name && classData.source) {
    const owner = { type: 'class' as const, name: classData.name, source: classData.source }
    const normalized = normalizeClassProficiencyChoices(
      owner,
      collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
    )
    const current = new Set(
      getCurrentClassProficiencyChoices(
        { ...classData, name: classData.name, source: classData.source },
        includeVariants,
        catalogs,
      ).map((choice) => choice.id),
    )
    for (const choice of normalized.choices) {
      const target = decodeClassProficiencyChoiceId(choice.id)?.target
      if (!target || target === DEFT_EXPLORER_TARGET || current.has(choice.id)) continue
      const key = `${target}|${choice.level}`
      if (seenProficiencyDiagnostics.has(key)) continue
      seenProficiencyDiagnostics.add(key)
      const feature = decodeClassFeatureReference(target.split('|').slice(1).join('|'))
      generalDiagnostics.push({
        code: 'unverified-required-choice',
        className: owner.name,
        classSource: owner.source,
        featureName: feature.name,
        level: choice.level,
        message: `${feature.name} proficiency rules are unavailable, conflicting or changed. Restore the exact feature source.`,
        requiredChoice: {
          target: {
            entityType: 'classFeature',
            name: feature.name,
            source: feature.source,
            ref: target.split('|').slice(1).join('|'),
          },
        },
      })
    }
  }
  if (
    canny?.choices.length &&
    !getCurrentCannyChoices(
      {
        name: classData.name!,
        source: classData.source!,
        classFeatureRefs: classData.classFeatureRefs,
      },
      includeVariants,
      catalogs,
    ).length
  )
    cannyDiagnostics.push({
      code: 'unverified-required-choice',
      className: classData.name!,
      classSource: classData.source!,
      featureName: 'Deft Explorer',
      level: canny.choices[0].level,
      message:
        'Canny setup rules are unavailable, conflicting or changed. Restore the exact Deft Explorer source.',
      requiredChoice: {
        target: {
          entityType: 'classFeature',
          name: 'Deft Explorer',
          source: 'TCE',
          ref: 'Deft Explorer|Ranger|PHB|1|TCE',
        },
        replaces: 'Natural Explorer|Ranger|PHB|1|PHB',
      },
    })
  return [
    ...classDiagnostics.filter(
      (diagnostic) =>
        !(
          diagnostic.requiredChoice?.target.entityType === 'classFeature' &&
          getClassFeatureIdentity(
            decodeClassFeatureReference(diagnostic.requiredChoice.target.ref ?? ''),
          ) === DEFT_EXPLORER_TARGET
        ) && includeDiagnostic(diagnostic, classDiagnostics),
    ),
    ...cannyDiagnostics,
    ...generalDiagnostics,
    ...subclassProficiencyDiagnostics,
    ...subclassDiagnostics.filter(
      (diagnostic) =>
        !(
          diagnostic.requiredChoice?.target.entityType === 'subclassFeature' &&
          classProficiencyRule(getClassChoiceFeatureTarget(diagnostic.requiredChoice.target) ?? '')
        ) && includeDiagnostic(diagnostic, subclassDiagnostics),
    ),
  ]
}

/** Both qualified candidate sides remain visible to source inspection, including audit diagnostics. */
export function getClassChoiceDiagnosticCandidates(
  classData: Parameters<typeof getClassChoiceDiagnosticCandidateSide>[0],
  subclass: Parameters<typeof getClassChoiceDiagnosticCandidateSide>[1],
  catalogs?: Parameters<typeof getClassChoiceDiagnosticCandidateSide>[3],
) {
  const rows = [
    ...getClassChoiceDiagnosticCandidateSide(classData, subclass, false, catalogs),
    ...getClassChoiceDiagnosticCandidateSide(classData, subclass, true, catalogs),
  ]
  return [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()]
}

export function getCharacterClassChoiceDiagnostics(
  classData: Parameters<typeof getClassChoiceDiagnosticCandidateSide>[0],
  subclass: Parameters<typeof getClassChoiceDiagnosticCandidateSide>[1],
  activity: OptionalClassFeatureActivity,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (activity.catalogs !== catalogs)
    throw new RangeError('Class activity requires the current source catalog.')
  return getClassChoiceDiagnosticCandidates(classData, subclass, catalogs).filter(
    activity.diagnostic,
  )
}
