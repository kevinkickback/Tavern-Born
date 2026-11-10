import {
  ARMOR_MODEL_GROUP,
  getArmorModelConfiguration,
  resolveArmorModelOption,
} from '@/lib/5etools/artificerArmorModels'
import { readArtificerInfusionPlans } from '@/lib/5etools/artificerInfusionPlans'
import {
  BLESSED_STRIKES_ID,
  getCurrentBlessedStrikes,
  isBlessedStrikesOption,
} from '@/lib/5etools/blessedStrikesSource'
import { getProgressiveChoiceGainCount } from '@/lib/5etools/classChoiceNormalization'
import { getClassOrderBranch, getClassOrderById } from '@/lib/5etools/classOrderIdentity'
import { getCurrentClassOrderOption } from '@/lib/5etools/classOrderSource'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  ELEMENTAL_FURY_ID,
  ELEMENTAL_FURY_LEVEL,
  ELEMENTAL_FURY_NAME,
  getCurrentElementalFury,
} from '@/lib/5etools/elementalFurySource'
import {
  normalizeFavoredEnemyChoices,
  resolveFavoredEnemyOption,
} from '@/lib/5etools/favoredEnemyChoices'
import {
  decodeFavoredEnemyChoiceId,
  FAVORED_ENEMY_GRANTS,
  FAVORED_ENEMY_TARGET,
} from '@/lib/5etools/favoredEnemyIdentity'
import { getFavoredEnemySources } from '@/lib/5etools/favoredEnemySource'
import {
  decodeLegacySubclassChoice,
  isKenseiChoiceId,
  legacyChoiceKey,
} from '@/lib/5etools/legacySubclassChoiceIdentity'
import {
  getLegacySubclassChoices,
  getLegacySubclassFamily,
  isLegacyChoiceItemEligible,
  legacySubclassChoiceDiagnostic,
} from '@/lib/5etools/legacySubclassChoices'
import { normalizePsionicChoices, psionicSlotIsCurrent } from '@/lib/5etools/psionicChoices'
import { getPsionicEntries } from '@/lib/5etools/psionicEntries'
import { decodePsionicChoiceId, PSIONIC_CLASS_SOURCE } from '@/lib/5etools/psionicIdentity'
import { resolvePsionic } from '@/lib/5etools/psionics'
import { getCurrentWeaponProficiencies } from '@/lib/calculations/weaponProficiency'
import { isValidKenseiSelection } from '@/lib/schema/legacySubclassChoiceValidation'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getCreatureTypes, matchesClassChoiceFilter } from './classChoiceFilters'

export {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
  collectSubclassFeatures,
  indexSubclassFeatureTargets,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'

import {
  getBarbarianPathChoice,
  getBarbarianPathChoiceGroup,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import {
  getBarbarianPathSetup,
  resolveBarbarianPathOption,
} from '@/lib/5etools/barbarianPathChoices'
import { getCurrentCannyChoices, normalizeCannyChoices } from '@/lib/5etools/cannyChoices'
import {
  getLandTerrainSetup,
  isCircleOfTheLand,
  LAND_GROUP,
  resolveLandTerrainOption,
} from '@/lib/5etools/circleOfTheLand'
import { featCategoryToFull, optFeatureTypeToFull } from '@/lib/5etools/classData'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
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
import { readDeclaredInvocationBook } from '@/lib/5etools/declaredInvocationBook'
import { readDeclaredInvocationCast } from '@/lib/5etools/declaredInvocationCasting'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  getDivineSoulConfiguration,
  getDivineSoulOwnerRule,
  isDivineSoulConfigurationGroup,
  resolveDivineSoulConfigurationOption,
} from '@/lib/5etools/divineSoulConfiguration'
import { permitsClassRuleSource } from '@/lib/5etools/earnedClassFeatureSource'
import {
  decodeFeatureOptionReference,
  isFeatureLiteralChoiceId,
} from '@/lib/5etools/featureOptionIdentity'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { hasDeclaredClassFeatSpellContext } from '@/lib/5etools/featureSpellSemantics'
import {
  type FeatureTableDefinition,
  type FeatureTableOption,
  resolveFeatureTableOption,
} from '@/lib/5etools/featureTableOptions'
import { getItemPropertyLabel, getItemPropertyReferences } from '@/lib/5etools/itemProperties'
import {
  getNamedSubclassSpellRule,
  getNamedSubclassSpellSetup,
  getNamedSubclassSpellSource,
} from '@/lib/5etools/namedSubclassSpells'
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
import {
  getRevisedAffinitySetup,
  isRevisedAffinityOwner,
  REVISED_AFFINITY_GROUP,
  REVISED_AFFINITY_ID,
  resolveRevisedAffinityOption,
  revisedAffinityDiagnostic,
} from '@/lib/5etools/revisedElementalAffinity'
import {
  getRevisedHunterSetup,
  resolveRevisedHunterOption,
} from '@/lib/5etools/revisedHunterChoices'
import { getRevisedHunterRule, REVISED_HUNTER_GROUP } from '@/lib/5etools/revisedHunterIdentity'
import {
  getScionConfiguration,
  isScionOwner,
  resolveScionOption,
  SCION_GROUP,
} from '@/lib/5etools/rogueScion'
import { resolveStormFeature } from '@/lib/5etools/stormAuraChoices'
import {
  isStormAuraChoiceId,
  STORM_TARGETS,
  stormFeatureRef,
} from '@/lib/5etools/stormAuraIdentity'
import { getSubclassFeatureConfigurationRule } from '@/lib/5etools/subclassFeatureConfiguration'
import { getSubclassProficiencyDiagnostics } from '@/lib/5etools/subclassProficiencyChoices'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import {
  getInvocationActorKey,
  getRevisedInvocationCantripRule,
  hasCurrentRevisedInvocationOption,
  type InvocationCantripsByOwner,
  isRevisedInvocationPoolId,
  isRevisedTargetedInvocation,
  meetsInvocationCantripCondition,
} from '@/lib/5etools/warlockInvocationCantripSource'
import {
  getWarlockPatronConfigurationRules,
  getWarlockPatronConfigurations,
  isWarlockPatronConfigurationGroup,
  resolveWarlockPatronConfigurationOption,
} from '@/lib/5etools/warlockPatronConfigurations'
import {
  getNormalizedItemTraits,
  isSelectableEquipmentItem,
} from '@/lib/calculations/itemClassification'
import type {
  Class5e,
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
import type { Character, CharacterClassChoiceOption } from '@/types/character'
import type {
  ChoiceOptionEntityType,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  getCurrentRevisedAtWillInvocation,
  isRevisedAtWillInvocationOption,
} from './atWillInvocationRules'
import {
  getClassChoiceCatalogOptionKey,
  getClassChoiceFeatureTarget,
  getClassChoiceOptionKey,
  getFeatureOwnerKey,
  getInvocationCantripLabel,
} from './classChoiceIdentity'
import { getCurrentOwnedProficiencyCandidates } from './classProficiencyAuthority'
import { resolveClassProficiencyOptions } from './classProficiencyOptions'
import {
  getCompanionFamilyMasteryOption,
  getCompanionFamilyOptions,
  getCompanionFamilyRules,
  hasAuthoredCompanionFamilies,
  isCompanionFamilyOption,
} from './companionFamilies'
import {
  getDeclaredInvocationLeaf,
  getDeclaredInvocationRequirement,
  hasDeclaredInvocationSpells,
} from './declaredInvocationPrerequisites'
import { getFighterStylePair } from './fighterStyleChoices'
import { getOptionalClassPoolSection } from './optionalClassAdoptionRules'
import {
  createOptionalClassFeatureActivity,
  type OptionalClassFeatureActivity,
} from './optionalClassFeatureActivity'
import { hasEarnedRevisedInvocationSlots } from './warlockInvocationChoices'
import {
  getBladeInvocationSource,
  getCurrentBladeInvocationRule,
  getCurrentPactBladeState,
  isBladeDependentInvocation,
  isPactBladeOption,
} from './warlockInvocationSource'

export interface ClassChoiceOptionView {
  reference: NormalizedChoiceOptionReference
  availability: 'eligible' | 'retained'
  displayLabel?: string
  setupComplete?: boolean
  entries: unknown[]
  masteries?: Array<{ name: string; source?: string; entries: unknown[] }>
  weaponCategory?: string
  weaponRange?: 'Melee' | 'Ranged'
  prerequisite?: Raw5ePrereq[]
  presentation?: ClassChoiceOptionPresentation
  searchText?: string
  featureOption?: { damageType: string }
  sourceGroup?: { group: string }
  invocationPrerequisite?: { key: string; name: string }
  unavailableReason?: string
  minimumClassLevel?: number
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

export function isClassChoiceOptionEligibleInDraft(
  option: ClassChoiceOptionView,
  selectedIds: ReadonlySet<string>,
) {
  return option.invocationPrerequisite
    ? selectedIds.has(option.invocationPrerequisite.key)
    : isClassChoiceOptionEligible(option)
}

export function retainsInvocationWithoutPrerequisite(
  options: readonly ClassChoiceOptionView[],
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
) {
  return options.some((option) => {
    const prerequisite = option.invocationPrerequisite?.key
    if (
      !prerequisite ||
      !isClassChoiceOptionEligible(option) ||
      !previous.has(prerequisite) ||
      next.has(prerequisite)
    )
      return false
    const key = getClassChoiceOptionKey(option.reference)
    return previous.has(key) && next.has(key)
  })
}

export function getClassChoiceCompletionCount(
  choice: Pick<NormalizedCharacterChoice, 'id'>,
  views: readonly ClassChoiceOptionView[],
) {
  return decodeFavoredEnemyChoiceId(choice.id)
    ? views.some((v) => v.setupComplete)
      ? 1
      : 0
    : views.filter(isClassChoiceOptionEligible).length
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
  | import('@/types/5etools').Psionic5e
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
    Pick<ClassChoiceFeatureCatalogs, 'classes' | 'subclassFeatureCandidates' | 'psionics'>,
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

function getRawFeatureTypes(entity: ChoiceCatalogEntity): string[] {
  const raw = (entity as OptionalFeatureLike).featureType
  return (Array.isArray(raw) ? raw : [raw]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
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
  return getItemPropertyReferences(item.property).map((value) =>
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
    | 'classes'
    | 'classFeatures'
    | 'classFeatureCandidates'
    | 'subclassFeatures'
    | 'subclassFeatureCandidates'
  >,
  cache?: Map<string, FeatureTableDefinition | undefined>,
): FeatureTableOption | SourceGroupOption | undefined {
  const target = decodeFeatureOptionReference(option)
  if (target?.format === 'source-group' && target.group === REVISED_AFFINITY_GROUP)
    return resolveRevisedAffinityOption(option, catalogs)
  if (target?.format === 'source-group' && getBarbarianPathChoiceGroup(target.group))
    return resolveBarbarianPathOption(option, catalogs)
  if (target?.format === 'source-group' && target.group === LAND_GROUP)
    return resolveLandTerrainOption(option, catalogs.classes)
  if (target?.format === 'source-group' && isWarlockPatronConfigurationGroup(target.group))
    return resolveWarlockPatronConfigurationOption(option, catalogs.classes)
  if (target?.format === 'source-group' && isDivineSoulConfigurationGroup(target.group))
    return resolveDivineSoulConfigurationOption(option, catalogs.classes)
  if (target?.format === 'source-group' && target.group === ARMOR_MODEL_GROUP)
    return resolveArmorModelOption(option, catalogs.classes)
  if (target?.format === 'source-group' && target.group === SCION_GROUP)
    return resolveScionOption(option, catalogs.classes)
  if (target?.format === 'source-group')
    return target.group === REVISED_HUNTER_GROUP
      ? resolveRevisedHunterOption(option, catalogs)
      : (resolveNaturalExplorerOption(option, catalogs) ??
          resolveFavoredEnemyOption(option, catalogs))
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
  if (option.entityType === 'psionic') return resolvePsionic(option, catalogs.psionics)
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
    | 'classFeatures'
    | 'classFeatureCandidates'
    | 'ambiguousClassFeatureTargets'
    | 'subclassFeatures'
    | 'subclassFeatureCandidates'
  >,
): ClassFeature | SubclassFeature | undefined {
  const target = getClassChoiceFeatureTarget(option)
  if (!target) return undefined
  if (option.entityType === 'classFeature') {
    if (catalogs.ambiguousClassFeatureTargets?.has(target)) return undefined
    const candidates = catalogs.classFeatureCandidates
      ? (catalogs.classFeatureCandidates.get(target) ?? [])
      : catalogs.classFeatures.filter((feature) => getClassFeatureIdentity(feature) === target)
    return candidates.length === 1 && !candidates[0].sourceIdentityConflict
      ? candidates[0]
      : undefined
  }
  if (option.entityType !== 'subclassFeature') return undefined
  const candidates = catalogs.subclassFeatureCandidates
    ? (catalogs.subclassFeatureCandidates.get(target) ?? [])
    : catalogs.subclassFeatures.filter((feature) => getSubclassFeatureIdentity(feature) === target)
  const first = candidates[0]
  if (!first || candidates.some((feature) => feature.sourceIdentityConflict)) return undefined
  if (STORM_TARGETS.has(target)) return resolveStormFeature(target, candidates)
  return candidates.length === 1 ? first : undefined
}

function isFavoredEnemyOption(o: NormalizedChoiceOptionReference) {
  return decodeFeatureOptionReference(o)?.parentIdentity === FAVORED_ENEMY_TARGET
}
function resolveExplicitOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceCatalogs,
  availability: ClassChoiceOptionView['availability'] = 'eligible',
  cache?: Map<string, FeatureTableDefinition | undefined>,
): ClassChoiceOptionView {
  const match = resolveClassChoiceOptionEntity(option, catalogs, cache)
  if (option.entityType === 'featureOption' && match) {
    const path = 'group' in match ? getBarbarianPathChoiceGroup(String(match.group)) : undefined
    return {
      availability,
      reference: option,
      entries: match.entries ?? [],
      presentation: {
        kind: 'feature',
        featureTypeLabels: [
          path?.feature ??
            ('group' in match
              ? match.group === REVISED_HUNTER_GROUP
                ? 'Hunter option'
                : match.group === REVISED_AFFINITY_GROUP
                  ? 'Damage type'
                  : match.group === LAND_GROUP
                    ? 'Circle terrain'
                    : match.group === SCION_GROUP
                      ? 'Dread Allegiance'
                      : match.group === ARMOR_MODEL_GROUP
                        ? 'Armor Model'
                        : isDivineSoulConfigurationGroup(String(match.group))
                          ? 'Divine affinity'
                          : isFavoredEnemyOption(option)
                            ? 'Favored enemy'
                            : 'Favored terrain'
              : 'Dragon ancestry'),
        ],
      },
      ...('group' in match
        ? { sourceGroup: { group: String(match.group) } }
        : { featureOption: { damageType: (match as FeatureTableOption).damageType } }),
      searchText: path
        ? `${option.name} ${path.feature} ${path.owner.subclassName} ${option.source ?? ''}`
        : `${option.name} ${'damageType' in match ? match.damageType : ''}`,
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

function resolveProgressionOption(
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceCatalogs,
  saved: readonly CharacterClassChoiceOption[],
  classLevel: number,
  tables: Map<string, FeatureTableDefinition | undefined>,
): ClassChoiceOptionView {
  const view = resolveExplicitOption(option, catalogs, 'eligible', tables)
  if (!choice.fixedOptions?.length || view.availability !== 'eligible') return view
  const requirements = view.prerequisite ?? []
  const [rule] = requirements
  const level = rule?.level
  const qualifiedLevel =
    requirements.length === 1 &&
    Object.keys(rule).length === 1 &&
    level &&
    typeof level === 'object' &&
    normalized(level.class?.name) === normalized(choice.owner.name) &&
    (!level.class?.source || normalized(level.class.source) === normalized(choice.owner.source)) &&
    !!choice.owner.subclassShortName &&
    normalized(level.subclass?.name) === normalized(choice.owner.subclassShortName) &&
    (!level.subclass?.source ||
      normalized(level.subclass.source) === normalized(choice.owner.subclassSource)) &&
    Number.isInteger(level.level) &&
    level.level >= choice.level &&
    level.level <= 20
      ? level.level
      : undefined
  const minimumClassLevel =
    requirements.length === 0
      ? (option.minimumClassLevel ?? choice.level)
      : option.minimumClassLevel === undefined || option.minimumClassLevel === qualifiedLevel
        ? qualifiedLevel
        : undefined
  const previous = saved.find(
    (row) => getClassChoiceOptionKey(row) === getClassChoiceOptionKey(option),
  )
  const eligible =
    minimumClassLevel !== undefined &&
    minimumClassLevel <= classLevel &&
    (!previous || minimumClassLevel <= previous.slotLevel)
  return {
    ...view,
    prerequisite: undefined,
    minimumClassLevel,
    availability: eligible ? 'eligible' : 'retained',
    ...(!eligible && {
      unavailableReason:
        minimumClassLevel === undefined
          ? 'The current discipline prerequisite could not be verified.'
          : `Requires ${choice.owner.name} level ${minimumClassLevel} when learned.`,
    }),
  }
}

function withEarnedChoiceLevel(
  choice: NormalizedCharacterChoice,
  view: ClassChoiceOptionView,
  level: number | undefined,
  saved: readonly CharacterClassChoiceOption[],
  classLevel: number,
): ClassChoiceOptionView {
  if (!isClassChoiceOptionEligible(view)) return view
  const previous = saved.find(
    (option) => getClassChoiceOptionKey(option) === getClassChoiceOptionKey(view.reference),
  )
  return {
    ...view,
    minimumClassLevel: level,
    ...(level === undefined || level > (previous?.slotLevel ?? classLevel)
      ? {
          availability: 'retained',
          unavailableReason:
            level === undefined
              ? 'The current source prerequisite could not be verified.'
              : `Requires ${choice.owner.name} level ${level} when learned.`,
        }
      : {}),
  }
}

function getInfusionLearningLevel(choice: NormalizedCharacterChoice, view: ClassChoiceOptionView) {
  if (!view.prerequisite?.length) return choice.level
  const levels = view.prerequisite.flatMap((rule) => {
    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule) ||
      Object.keys(rule).some((key) => key !== 'level' && key !== 'item')
    )
      return []
    const level = rule.level
    if (level === undefined) return [choice.level]
    return !!level &&
      typeof level === 'object' &&
      !level.subclass &&
      normalized(level.class?.name) === normalized(choice.owner.name) &&
      (!level.class?.source ||
        normalized(level.class.source) === normalized(choice.owner.source)) &&
      Number.isInteger(level.level) &&
      level.level >= choice.level &&
      level.level <= 20
      ? [level.level]
      : []
  })
  return levels.length ? Math.min(...levels) : undefined
}

export function getEarnedFixedClassChoiceOptions(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
  classLevel: number,
) {
  return (choice.fixedOptions ?? []).flatMap(({ level, option }) => {
    if (level > classLevel) return []
    const matches = catalogs.optionalFeatures?.filter(
      (row) =>
        getClassChoiceOptionKey({ ...row, entityType: 'optionalFeature' }) ===
        getClassChoiceOptionKey(option),
    )
    const feature = matches?.[0]
    return matches?.length === 1 &&
      feature?.entries?.length &&
      feature.featureType?.includes('ED') &&
      !('sourceIdentityConflict' in feature && feature.sourceIdentityConflict) &&
      !feature.prerequisite?.length
      ? [{ level, option, name: feature.name, source: feature.source, entries: feature.entries }]
      : []
  })
}

export function getCurrentClassChoiceDeclaration(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (choice.owner.type !== 'class') return undefined
  const owners = catalogs.classes?.filter((cls) => findClassReference(choice.owner, [cls]))
  if (owners?.length !== 1 || owners[0].sourceIdentityConflict) return undefined
  const refs = owners[0].classFeatureRefs?.filter(
    (ref) =>
      normalized(ref.name) === normalized(choice.owner.featureName) &&
      normalized(ref.source) === normalized(choice.owner.featureSource) &&
      getClassFeatureReferenceLevel(ref) === choice.level,
  )
  if (refs?.length !== 1) return undefined
  const [ref] = refs
  const target = getClassFeatureIdentity(ref)
  if (
    !target ||
    typeof ref.ref !== 'string' ||
    getClassFeatureIdentity(decodeClassFeatureReference(ref.ref)) !== target ||
    catalogs.ambiguousClassFeatureTargets?.has(target)
  )
    return undefined
  const digest = getFeatureSourceDigest([ref.feature], false)
  return getCurrentDirectClassFeature(
    owners[0],
    catalogs,
    target,
    (feature) => getFeatureSourceDigest([feature], false) === digest,
  )
}

function satisfyFightingStyleRequirement(option: ClassChoiceOptionView): ClassChoiceOptionView {
  if (option.reference.entityType !== 'feat' || !option.prerequisite?.length) return option
  let satisfied = false
  const prerequisite = option.prerequisite.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
    const { feature, ...rest } = entry
    if (!Array.isArray(feature) || feature.length !== 1 || feature[0] !== 'Fighting Style')
      return entry
    satisfied ||= Object.keys(rest).length === 0
    return rest
  })
  return { ...option, prerequisite: satisfied ? undefined : prerequisite }
}

/** Resolves one normalized choice against filtered catalogs without source-specific option lists. */
export function resolveClassChoiceOptions(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceCatalogs,
  saved: readonly CharacterClassChoiceOption[] = [],
  classLevel = 20,
  character?: Character,
  knownWarlockCantrips?: InvocationCantripsByOwner,
): ClassChoiceOptionView[] {
  const named = getNamedSubclassSpellRule(choice.id)
  if (named) {
    const { owner } = named
    const classes = catalogs.classes?.filter((row) => findClassReference(owner, [row]))
    const cls = classes?.length === 1 ? classes[0] : undefined
    const subclasses = cls?.subclasses?.filter((row) =>
      findClassReference({ name: owner.subclassName, source: owner.subclassSource }, [row]),
    )
    const subclass = subclasses?.length === 1 ? subclasses[0] : undefined
    const scoped = scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(owner.name, owner.source, owner.subclassName, owner.subclassSource),
    )
    const current =
      cls &&
      subclass &&
      classLevel >= named.level &&
      (!character ||
        [owner.source, owner.subclassSource, named.source].every((source) =>
          permitsClassRuleSource(character, source),
        ))
        ? getNamedSubclassSpellSource(cls, subclass, scoped)
        : undefined
    const setup =
      cls &&
      subclass &&
      current &&
      (!character ||
        [current.feature.classSource, current.feature.subclassSource].every((source) =>
          permitsClassRuleSource(character, source),
        ))
        ? getNamedSubclassSpellSetup(cls, subclass, scoped)
        : undefined
    const options = setup?.id === choice.id ? setup.options : []
    const active = new Set(options.map(getClassChoiceOptionKey))
    return [...options, ...saved.filter((row) => !active.has(getClassChoiceOptionKey(row)))].map(
      (reference) => ({
        reference,
        availability: active.has(getClassChoiceOptionKey(reference)) ? 'eligible' : 'retained',
        ...(active.has(getClassChoiceOptionKey(reference)) && {
          sourceGroup: { group: 'named-subclass-spells' },
        }),
        entries: Object.entries(
          current?.named.find(({ name }) => normalized(name) === normalized(reference.name))
            ?.prepared ?? {},
        ).map(
          ([level, spells]) =>
            `Level ${level}: ${spells.map((spell) => `{@spell ${spell.replace(/#c$/i, '')}}`).join(', ')}.`,
        ),
      }),
    )
  }
  if (
    choice.kind === 'optional-feature' &&
    getProgressiveChoiceGainCount(choice, choice.level) !== undefined
  ) {
    const keyOf = (option: OptionalFeatureLike) =>
      getClassChoiceOptionKey({
        entityType: 'optionalFeature',
        name: option.name,
        source: option.source,
      })
    const counts = new Map<string, number>()
    for (const option of catalogs.optionalFeatures) {
      const key = keyOf(option)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    catalogs = {
      ...catalogs,
      optionalFeatures: catalogs.optionalFeatures.filter((option) => {
        if (
          !option.source ||
          (choice.fixedOptions?.length && !option.featureType?.includes('ED')) ||
          ('sourceIdentityConflict' in option && option.sourceIdentityConflict === true)
        )
          return false
        const key = keyOf(option)
        return (
          counts.get(key) === 1 &&
          (!catalogs.optionalFeatureCandidates ||
            catalogs.optionalFeatureCandidates.get(key)?.length === 1)
        )
      }),
    }
  }
  const order = getClassOrderById(choice.id)
  if (order?.owner === 'druid') {
    return [
      ...new Map(
        [...choice.options, ...saved].map((reference) => [
          getClassChoiceOptionKey(reference),
          reference,
        ]),
      ).values(),
    ].map((reference) => {
      const branch = getClassOrderBranch(reference, order)
      const feature =
        branch && classLevel >= choice.level && getCurrentClassOrderOption(catalogs, order, branch)
      return feature
        ? { ...resolveExplicitOption(reference, catalogs), entries: feature.entries ?? [] }
        : { reference, availability: 'retained', entries: [] }
    })
  }
  if (choice.id === ELEMENTAL_FURY_ID) {
    const rules = getCurrentElementalFury(catalogs)
    const retained = new Set(saved.map(getClassChoiceOptionKey))
    return [
      ...new Map(
        [...choice.options, ...saved].map((row) => [getClassChoiceOptionKey(row), row]),
      ).values(),
    ].flatMap((reference): ClassChoiceOptionView[] => {
      const feature = classLevel >= choice.level && rules?.option(reference)
      if (feature) return [{ ...toView('classFeature', feature, catalogs, 'eligible'), reference }]
      return retained.has(getClassChoiceOptionKey(reference))
        ? [{ reference, availability: 'retained', entries: [] }]
        : []
    })
  }
  if (choice.id === BLESSED_STRIKES_ID) {
    const rules = getCurrentBlessedStrikes(catalogs)
    return [
      ...new Map(
        [...choice.options, ...saved].map((reference) => [
          getClassChoiceOptionKey(reference),
          reference,
        ]),
      ).values(),
    ].map((reference) => {
      if (!rules || !isBlessedStrikesOption(reference) || classLevel < choice.level)
        return { reference, availability: 'retained', entries: [] }
      return resolveExplicitOption(reference, catalogs)
    })
  }
  if (decodeLegacySubclassChoice(choice.id))
    return resolveLegacySubclassOptions(choice, catalogs, saved, classLevel, character)
  if (choice.kind === 'psionic' || choice.id.startsWith('psionic-choice:'))
    return resolvePsionicChoiceOptions(choice, catalogs, saved, classLevel, character)
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
  if (choice.kind === 'creature') {
    const key = ({ name, source }: Creature5e) =>
      getClassChoiceOptionKey({ entityType: 'creature', name, source })
    const counts = new Map<string, number>()
    for (const row of catalogs.creatures) {
      const id = key(row)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    catalogs = {
      ...catalogs,
      creatures: catalogs.creatures.filter(
        (row) => counts.get(key(row)) === 1 && row.sourceIdentityConflict !== true,
      ),
    }
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
  const enemy = decodeFavoredEnemyChoiceId(choice.id)
  const literal = decodeNaturalExplorerChoiceId(choice.id) ?? enemy
  if (
    isFeatureLiteralChoiceId(choice.id) &&
    !getRevisedHunterRule(choice.id) &&
    !getBarbarianPathChoice(choice.id) &&
    !getSubclassFeatureConfigurationRule(choice.id) &&
    choice.id !== REVISED_AFFINITY_ID &&
    (!literal ||
      !(enemy
        ? getFavoredEnemySources(catalogs).get(FAVORED_ENEMY_TARGET) &&
          getFavoredEnemySources(catalogs).get(literal.grant)
        : getNaturalExplorerSources(catalogs).get(literal.grant)))
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
  const fightingStyle =
    filter?.entityType === 'feat' &&
    filter.categories?.length === 1 &&
    filter.categories[0] === 'FS' &&
    normalized(choice.owner.featureName) === 'fighting style'
  const declaration =
    filter?.requiresMastery || fightingStyle
      ? getCurrentClassChoiceDeclaration(choice, catalogs)
      : undefined
  const declarationUnavailable =
    (filter?.requiresMastery || fightingStyle) && !!catalogs.classes && !declaration
  const currentFilter = declarationUnavailable ? undefined : filter
  const tableDefinitions = new Map<string, FeatureTableDefinition | undefined>()
  const resolved: ClassChoiceOptionView[] = []
  const families = character ? getCompanionFamilyOptions(character, choice, catalogs) : []
  const authoredFamilies =
    families.length > 0 || (character && hasAuthoredCompanionFamilies(character, choice, catalogs))
  const companionOwner =
    families.length &&
    character?.classProgression.find((entry) => findClassReference(choice.owner, [entry]))
  const currentFamily =
    character && companionOwner
      ? getCompanionFamilyRules(character, companionOwner, catalogs)
      : undefined
  for (const { family, creature, reference } of families) {
    const view = toView('creature', creature, catalogs)
    resolved.push({
      ...view,
      reference,
      displayLabel: `${family.name} — ${creature.name}`,
      searchText: `${family.name} ${creature.name} ${family.specialization} ${family.mastery.name}`,
      entries: [
        `${family.specialization} family. Mastery property: ${family.mastery.name}.`,
        ...(currentFamily?.specialization &&
        getClassChoiceOptionKey(currentFamily.reference) === getClassChoiceOptionKey(reference)
          ? ['While your companion is within 60 feet:', currentFamily.specialization]
          : []),
        ...view.entries,
      ],
      ...(family.unusual && {
        availability: 'retained',
        unavailableReason: 'This unusual family requires a special taming ability.',
      }),
    })
  }
  const petMastery =
    character &&
    !declarationUnavailable &&
    getCompanionFamilyMasteryOption(character, choice, catalogs)
  if (petMastery)
    resolved.push({
      reference: petMastery.reference,
      displayLabel: `${petMastery.reference.name} companion — ${petMastery.mastery.name}`,
      entries: petMastery.mastery.entries ?? [],
      availability: 'eligible',
    })
  const tableItems =
    choice.kind === 'item' &&
    choice.source.kind === 'class-table' &&
    !choice.optionFilter?.requiresMastery
  const infusions =
    choice.source.kind === 'optional-feature-progression' &&
    filter?.featureTypes?.length === 1 &&
    filter.featureTypes[0] === 'AI'
  if (
    choice.options.length > 0 &&
    !filter?.requiresMastery &&
    !filter?.restrictToListedOptions &&
    !declarationUnavailable
  ) {
    resolved.push(
      ...choice.options
        .filter(
          (option) => choice.fixedOptions?.length || (option.minimumClassLevel ?? 1) <= classLevel,
        )
        .filter(
          (option) =>
            !authoredFamilies ||
            option.entityType !== 'creature' ||
            saved.some(
              (row) =>
                !isCompanionFamilyOption(row) &&
                getClassChoiceOptionKey(row) === getClassChoiceOptionKey(option),
            ),
        )
        .map((option) => {
          const view = resolveProgressionOption(
            choice,
            option,
            catalogs,
            saved,
            classLevel,
            tableDefinitions,
          )
          return tableItems
            ? withEarnedChoiceLevel(
                choice,
                view,
                option.minimumClassLevel ?? choice.level,
                saved,
                classLevel,
              )
            : view
        }),
    )
  }
  if (currentFilter) {
    const listed = currentFilter.restrictToListedOptions
      ? new Set(choice.options.map(getClassChoiceOptionKey))
      : undefined
    const weapons =
      currentFilter.requiresMastery && currentFilter.requiresProficiency && character
        ? getCurrentWeaponProficiencies(character, catalogs.classes)
        : catalogs.weaponProficiencies
    const tableIndexes = new Map(
      tableItems
        ? resolved.map(
            (option, index) => [getClassChoiceOptionKey(option.reference), index] as const,
          )
        : [],
    )
    for (const entity of getFilteredCatalog(currentFilter, catalogs)) {
      if (authoredFamilies && currentFilter.entityType === 'creature') continue
      const matches = (candidate: NormalizedChoiceOptionFilter) =>
        matchesClassChoiceFilter(
          entity,
          candidate,
          catalogs.itemPropertyByAbbr,
          catalogs.itemTypeByAbbr,
          weapons,
          classLevel,
        )
      if (!matches(currentFilter)) continue
      const view = toView(currentFilter.entityType, entity, catalogs)
      if (listed && !listed.has(getClassChoiceOptionKey(view.reference))) continue
      if (tableItems) {
        const minimum = (candidate: NormalizedChoiceOptionFilter): number =>
          Math.max(
            candidate.minimumClassLevel ?? choice.level,
            candidate.anyOf?.length
              ? Math.min(...candidate.anyOf.filter(matches).map(minimum))
              : choice.level,
          )
        const level = minimum(currentFilter)
        const key = getClassChoiceOptionKey(view.reference)
        const prior = tableIndexes.get(key)
        if (prior !== undefined && (resolved[prior].minimumClassLevel ?? Infinity) <= level)
          continue
        const qualified = withEarnedChoiceLevel(choice, view, level, saved, classLevel)
        if (prior !== undefined) resolved[prior] = qualified
        else {
          tableIndexes.set(key, resolved.length)
          resolved.push(qualified)
        }
      } else if (infusions) {
        if (normalized(view.reference.name) === 'replicate magic item') continue
        resolved.push(
          withEarnedChoiceLevel(
            choice,
            { ...view, prerequisite: undefined },
            getInfusionLearningLevel(choice, view),
            saved,
            classLevel,
          ),
        )
      } else resolved.push(view)
    }
  }
  if (infusions) {
    const replicas = catalogs.optionalFeatures.filter(
      (row) =>
        normalized(row.name) === 'replicate magic item' &&
        normalized(row.source) === normalized(choice.owner.source),
    )
    const plan = replicas.length === 1 && readArtificerInfusionPlans(replicas[0], choice.level)
    if (plan) {
      const plans = new Map<string, ClassChoiceOptionView>()
      const addPlan = (view: ClassChoiceOptionView, level: number) => {
        const key = getClassChoiceOptionKey(view.reference)
        if ((plans.get(key)?.minimumClassLevel ?? Infinity) <= level) return
        plans.set(
          key,
          withEarnedChoiceLevel(
            choice,
            { ...view, displayLabel: `Replicate ${view.reference.name}` },
            level,
            saved,
            classLevel,
          ),
        )
      }
      for (const option of plan.options) {
        if ((option.minimumClassLevel ?? Infinity) > classLevel) continue
        const view = resolveExplicitOption(option, catalogs)
        if (isClassChoiceOptionEligible(view))
          addPlan(view, option.minimumClassLevel ?? choice.level)
      }
      for (const item of getFilteredCatalog(plan.alternate, catalogs)) {
        if (
          matchesClassChoiceFilter(
            item,
            plan.alternate,
            catalogs.itemPropertyByAbbr,
            catalogs.itemTypeByAbbr,
            catalogs.weaponProficiencies,
            classLevel,
          )
        )
          addPlan(toView('item', item, catalogs), choice.level)
      }
      resolved.push(...plans.values())
    }
  }

  const poolSection = getOptionalClassPoolSection(choice)
  const activity = character && createOptionalClassFeatureActivity(character, catalogs)
  const pair = getFighterStylePair(choice.id)
  const poolCounts = new Map<string, number>()
  if (poolSection || pair?.source === 'PHB')
    for (const row of catalogs.optionalFeatures) {
      const key = getClassChoiceOptionKey({
        entityType: 'optionalFeature',
        name: row.name,
        source: row.source,
      })
      poolCounts.set(key, (poolCounts.get(key) ?? 0) + 1)
    }
  const isCurrentPoolMember = (
    poolChoice: NormalizedCharacterChoice,
    section: ReturnType<typeof getOptionalClassPoolSection>,
    reference: NormalizedChoiceOptionReference,
  ) => {
    if (
      !section ||
      reference.entityType !== 'optionalFeature' ||
      normalized(reference.source) !== normalized(section.source)
    )
      return true
    if (!activity?.option(poolChoice, reference)) return false
    const key = getClassChoiceOptionKey(reference)
    const count = poolCounts.get(key) ?? 0
    const candidateCount = catalogs.optionalFeatureCandidates
      ? (catalogs.optionalFeatureCandidates.get(key) ?? []).length
      : count
    return count === 1 && candidateCount === 1
  }
  const targetCantrips = knownWarlockCantrips?.get(getInvocationActorKey(choice.owner)) ?? []
  const bladeSource = getBladeInvocationSource(choice.id)
  const invocationSourcesAvailable =
    bladeSource === 'xphb' &&
    (!character ||
      (permitsClassRuleSource(character, choice.owner.source) &&
        permitsClassRuleSource(character, bladeSource)))
  const bladePact =
    bladeSource && character && (bladeSource === 'xphb' || classLevel >= 5)
      ? getCurrentPactBladeState(character, catalogs, bladeSource, choice.owner)
      : undefined
  const bladeSlots =
    bladeSource &&
    (character?.classChoiceSelections?.filter((row) => row.choiceId === choice.id).length ?? 0) <=
      1 &&
    hasEarnedRevisedInvocationSlots(choice, saved, classLevel)
  const bladeUnavailable = 'Restore the exact Invocation source and its earned Pact of the Blade.'
  const invocationLevel = (level: number) => ({
    prerequisite: [
      { level: { level, class: { name: choice.owner.name, source: choice.owner.source } } },
    ],
  })
  const byKey = new Map(
    resolved
      .map((option) =>
        fightingStyle && declaration ? satisfyFightingStyleRequirement(option) : option,
      )
      .map((option) => {
        if (
          !choice.source.field.endsWith(':entries.filter-alternative-v1') ||
          option.reference.entityType !== 'feat' ||
          !choice.options.some(
            (row) => getClassChoiceOptionKey(row) === getClassChoiceOptionKey(option.reference),
          )
        )
          return option
        const candidates = catalogs.feats.filter(
          (feat) =>
            normalized(feat.name) === normalized(option.reference.name) &&
            normalized(feat.source) === normalized(option.reference.source),
        )
        return (!character || permitsClassRuleSource(character, option.reference.source)) &&
          candidates.length === 1 &&
          hasDeclaredClassFeatSpellContext(choice, candidates[0], declaration)
          ? { ...option, prerequisite: undefined }
          : { ...option, availability: 'retained' as const }
      })
      .filter((option) => isCurrentPoolMember(choice, poolSection, option.reference))
      .flatMap((option) => {
        if (bladeSource === 'xphb' && isPactBladeOption(option.reference, bladeSource)) {
          return bladePact
            ? [{ ...option, entries: bladePact.entries }]
            : [
                {
                  ...option,
                  entries: [],
                  availability: 'retained' as const,
                  unavailableReason: 'Restore the exact Pact of the Blade source.',
                },
              ]
        }
        if (bladeSource === 'xphb' && isRevisedAtWillInvocationOption(option.reference)) {
          const rule = invocationSourcesAvailable
            ? getCurrentRevisedAtWillInvocation(choice, option.reference, catalogs)
            : undefined
          if (!rule || classLevel < rule.minimumLevel)
            return [
              {
                ...option,
                entries: [],
                availability: 'retained' as const,
                unavailableReason: rule
                  ? `Requires Warlock level ${rule.minimumLevel}.`
                  : 'Restore the exact Invocation source.',
              },
            ]
          return [{ ...option, ...invocationLevel(rule.minimumLevel) }]
        }
        if (isBladeDependentInvocation(choice.id, option.reference)) {
          const rule =
            character &&
            getCurrentBladeInvocationRule(character, choice, option.reference, catalogs)
          const earned = rule && bladeSlots && rule.owner.levels >= rule.level.level
          const active = !!(earned && bladePact?.option)
          return [
            {
              ...option,
              availability: active ? ('eligible' as const) : ('retained' as const),
              entries: rule?.entries ?? [],
              prerequisite: rule ? [{ level: rule.level }] : undefined,
              ...(rule?.source === 'xphb' && invocationLevel(rule.level.level)),
              ...(earned &&
                rule.source === 'xphb' &&
                bladePact && {
                  invocationPrerequisite: {
                    key: getClassChoiceOptionKey(bladePact.reference),
                    name: bladePact.reference.name,
                  },
                }),
              ...(!active && {
                unavailableReason:
                  rule && rule.owner.levels < rule.level.level
                    ? `Requires Warlock level ${rule.level.level}.`
                    : earned && bladePact
                      ? 'Requires your current Pact of the Blade.'
                      : bladeUnavailable,
              }),
            },
          ]
        }
        if (!isRevisedInvocationPoolId(choice.id)) return [option]
        if (!isRevisedTargetedInvocation(option.reference)) {
          const rule = getDeclaredInvocationRequirement(choice, option.reference, catalogs)
          const declaredSpells = hasDeclaredInvocationSpells(option.reference, catalogs)
          if (rule === undefined && !declaredSpells) return [option]
          const leaf =
            declaredSpells && getDeclaredInvocationLeaf(choice, option.reference, catalogs)
          if (
            rule === null ||
            !invocationSourcesAvailable ||
            (character &&
              (!permitsClassRuleSource(character, option.reference.source) ||
                (rule?.required && !permitsClassRuleSource(character, rule.required.source)))) ||
            (declaredSpells &&
              (!leaf || (!readDeclaredInvocationCast(leaf) && !readDeclaredInvocationBook(leaf))))
          )
            return [
              {
                ...option,
                availability: 'retained' as const,
                entries: [],
                unavailableReason: 'Restore the exact Invocation and prerequisite sources.',
              },
            ]
          if (!rule) return [option]
          const requirement = rule.required && {
            name: rule.required.name,
            key: getClassChoiceOptionKey(rule.required),
          }
          const meetsLevel = classLevel >= rule.level
          const meetsPrerequisite =
            !requirement ||
            saved.some(
              (row) =>
                row.slotLevel <= classLevel &&
                row.ref === undefined &&
                row.invocationCantrip === undefined &&
                getClassChoiceOptionKey(row) === requirement.key,
            )
          const eligible = meetsLevel && meetsPrerequisite
          return [
            {
              ...option,
              ...invocationLevel(rule.level),
              availability: eligible ? ('eligible' as const) : ('retained' as const),
              ...(meetsLevel && requirement && { invocationPrerequisite: requirement }),
              ...(!eligible && {
                unavailableReason:
                  meetsLevel && requirement
                    ? `Requires ${requirement.name} in this Invocation pool.`
                    : `Requires ${choice.owner.name} level ${rule.level}.`,
              }),
            },
          ]
        }
        if (
          !invocationSourcesAvailable ||
          !targetCantrips.length ||
          !hasCurrentRevisedInvocationOption(choice, catalogs, option.reference)
        )
          return []
        const key = getClassChoiceCatalogOptionKey(option.reference)
        const candidates = catalogs.optionalFeatureCandidates
          ? (catalogs.optionalFeatureCandidates.get(key) ?? [])
          : catalogs.optionalFeatures.filter(
              (row) =>
                getClassChoiceCatalogOptionKey({
                  entityType: 'optionalFeature',
                  name: row.name,
                  source: row.source,
                }) === key,
            )
        const [feature] = candidates
        const rule =
          candidates.length === 1 &&
          feature &&
          normalized(feature.name) === normalized(option.reference.name)
            ? getRevisedInvocationCantripRule(feature)
            : undefined
        if (!rule || classLevel < rule.prerequisite.level) return []
        return targetCantrips.flatMap((spell) => {
          const eligible = meetsInvocationCantripCondition(spell, rule.condition)
          const trueStrikeMismatch =
            !eligible &&
            rule.condition === 'attack' &&
            normalized(spell.name) === 'true strike' &&
            normalized(spell.source) === 'xphb'
          if (!eligible && !trueStrikeMismatch) return []
          const reference = {
            ...option.reference,
            invocationCantrip: { name: spell.name, source: spell.source },
          }
          const displayLabel = getInvocationCantripLabel(reference)
          return [
            {
              ...option,
              reference,
              displayLabel,
              searchText: displayLabel,
              ...invocationLevel(rule.prerequisite.level),
              ...(trueStrikeMismatch && {
                availability: 'retained' as const,
                entries: [
                  'The current True Strike printing lacks the attack-roll metadata required by this Invocation.',
                ],
              }),
            },
          ]
        })
      })
      .map((option) => [getClassChoiceOptionKey(option.reference), option]),
  )
  for (const option of saved) {
    const key = getClassChoiceOptionKey(option)
    if (!byKey.has(key)) {
      const view = resolveExplicitOption(
        option,
        catalogs,
        enemy ? 'eligible' : 'retained',
        tableDefinitions,
      )
      const displayLabel = getInvocationCantripLabel(option)
      byKey.set(
        key,
        isBladeDependentInvocation(choice.id, option)
          ? { ...view, entries: [], prerequisite: undefined, unavailableReason: bladeUnavailable }
          : displayLabel
            ? { ...view, reference: option, displayLabel }
            : view,
      )
    }
  }
  const styleOwner =
    pair && character ? findClassReference(choice.owner, character.classProgression) : undefined
  const styleClasses = pair
    ? catalogs.classes?.filter((cls) => findClassReference(choice.owner, [cls]))
    : undefined
  const styleClass =
    styleClasses?.length === 1 && !styleClasses[0].sourceIdentityConflict
      ? styleClasses[0]
      : undefined
  const styleSubclasses = styleClass?.subclasses?.filter((subclass) =>
    findClassReference({ name: styleOwner?.subclass, source: styleOwner?.subclassSource }, [
      subclass,
    ]),
  )
  const styleSubclass =
    styleSubclasses?.length === 1 && !styleSubclasses[0].sourceIdentityConflict
      ? styleSubclasses[0]
      : undefined
  const currentStyles =
    styleClass && styleOwner && activity
      ? getCharacterClassChoices(styleClass, styleSubclass, activity, catalogs).filter((row) => {
          const filter = row.optionFilter
          return pair?.source === 'PHB'
            ? filter?.entityType === 'optionalFeature' &&
                filter.featureTypes?.length === 1 &&
                filter.featureTypes[0] === 'FS:F'
            : filter?.entityType === 'feat' &&
                filter.categories?.length === 1 &&
                filter.categories[0] === 'FS'
        })
      : []
  const currentStyle = currentStyles.find(
    (row) => row.id === choice.id && row.level <= (styleOwner?.levels ?? 0),
  )
  const savedStyleKeys = pair ? new Set(saved.map(getClassChoiceOptionKey)) : undefined
  const earnedStyleKeys = pair
    ? new Set(
        saved.filter((option) => option.slotLevel === choice.level).map(getClassChoiceOptionKey),
      )
    : undefined
  const styleCandidates = new Map<string, Array<Feat5e | OptionalFeatureLike>>()
  if (pair && savedStyleKeys) {
    const entityType = pair.source === 'PHB' ? 'optionalFeature' : 'feat'
    for (const row of pair.source === 'PHB' ? catalogs.optionalFeatures : catalogs.feats) {
      const key = getClassChoiceOptionKey({ entityType, name: row.name, source: row.source })
      if (byKey.has(key)) styleCandidates.set(key, [...(styleCandidates.get(key) ?? []), row])
    }
    for (const [key, option] of byKey) {
      const rows = styleCandidates.get(key)
      if (
        option.reference.source?.trim() &&
        (!character || !styleClasses || currentStyle) &&
        (!savedStyleKeys.has(key) || earnedStyleKeys?.has(key)) &&
        rows?.length === 1 &&
        !('sourceIdentityConflict' in rows[0] && rows[0].sourceIdentityConflict === true)
      ) {
        if (currentStyle) byKey.set(key, satisfyFightingStyleRequirement(option))
        continue
      }
      if (savedStyleKeys.has(key)) byKey.set(key, { ...option, availability: 'retained' })
      else byKey.delete(key)
    }
  }
  if (pair && character && styleOwner && savedStyleKeys) {
    const siblingId = choice.id === pair.base ? pair.additional : pair.base
    const sibling = currentStyles.find((row) => row.id === siblingId)
    const siblingRows = character.classChoiceSelections?.filter((row) => row.choiceId === siblingId)
    const row = siblingRows?.length === 1 ? siblingRows[0] : undefined
    if (
      sibling &&
      row &&
      row.kind === sibling.kind &&
      row.classLevel === sibling.level &&
      row.selected.length === 1 &&
      row.selected[0].slotLevel === sibling.level &&
      styleOwner.levels >= sibling.level &&
      findClassReference({ name: row.className, source: row.classSource }, [styleOwner]) &&
      normalized(row.subclassName) === normalized(sibling.owner.subclassName) &&
      normalized(row.subclassSource) === normalized(sibling.owner.subclassSource)
    ) {
      const key = getClassChoiceOptionKey(row.selected[0])
      const option = byKey.get(key)
      const candidate = styleCandidates.get(key)?.[0]
      const keepsOriginal = choice.id === pair.base && earnedStyleKeys?.has(key)
      const repeats =
        option?.reference.entityType === 'feat' &&
        candidate &&
        'repeatable' in candidate &&
        candidate.repeatable === true
      if (
        option?.availability === 'eligible' &&
        !keepsOriginal &&
        !repeats &&
        candidate &&
        sibling.optionFilter &&
        isCurrentPoolMember(sibling, getOptionalClassPoolSection(sibling), row.selected[0]) &&
        matchesClassChoiceFilter(
          candidate,
          sibling.optionFilter,
          catalogs.itemPropertyByAbbr,
          catalogs.itemTypeByAbbr,
          catalogs.weaponProficiencies,
          styleOwner.levels,
        )
      ) {
        if (savedStyleKeys.has(key)) byKey.set(key, { ...option, availability: 'retained' })
        else byKey.delete(key)
      }
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.reference.name.localeCompare(right.reference.name) ||
      normalized(left.reference.source).localeCompare(normalized(right.reference.source)),
  )
}

function resolveLegacySubclassOptions(
  requested: NormalizedCharacterChoice,
  catalogs: ClassChoiceCatalogs,
  saved: readonly CharacterClassChoiceOption[],
  classLevel: number,
  character?: Character,
): ClassChoiceOptionView[] {
  const owner = requested.owner,
    scoped = scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(owner.name, owner.source, owner.subclassName, owner.subclassSource),
    )
  const current = getLegacySubclassChoices(
    owner,
    owner.subclassName && owner.subclassSource
      ? { name: owner.subclassName, source: owner.subclassSource }
      : undefined,
    scoped,
  ).find((c) => c.id === requested.id)
  const dependencies = (catalogs.legacySubclassChoices ?? []).filter(
    (row) =>
      row.ownerKey ===
      getFeatureOwnerKey(owner.name, owner.source, owner.subclassName, owner.subclassSource),
  )
  const dependency = dependencies.length === 1 ? dependencies[0] : undefined
  const local = {
    ...catalogs,
    items: [],
    itemsBase: dependency?.items ?? [],
    optionalFeatures: dependency?.optionalFeatures ?? [],
    itemPropertyByAbbr: dependency?.itemPropertyByAbbr ?? {},
    itemTypeByAbbr: dependency?.itemTypeByAbbr ?? {},
  }
  const views = new Map<string, ClassChoiceOptionView>()
  if (
    current &&
    dependency &&
    classLevel >= current.level &&
    JSON.stringify(current) === JSON.stringify(requested)
  ) {
    const occupied = new Set(
      (character?.classChoiceSelections ?? [])
        .filter(
          (row) =>
            row.choiceId !== requested.id &&
            isKenseiChoiceId(row.choiceId) &&
            isValidKenseiSelection(row) &&
            legacyChoiceKey(row.className) === legacyChoiceKey(owner.name) &&
            legacyChoiceKey(row.classSource) === legacyChoiceKey(owner.source),
        )
        .flatMap((row) => row.selected.map((v) => legacyChoiceKey(v.name))),
    )
    const candidates = current.kind === 'item' ? dependency.items : dependency.optionalFeatures
    const counts = new Map<string, number>()
    for (const row of candidates) {
      const k = `${legacyChoiceKey(row.name)}|${legacyChoiceKey(row.source)}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const row of candidates) {
      const k = `${legacyChoiceKey(row.name)}|${legacyChoiceKey(row.source)}`
      if (counts.get(k) !== 1 || (row as Record<string, unknown>).sourceIdentityConflict === true)
        continue
      if (current.kind === 'item') {
        if (
          occupied.has(legacyChoiceKey(row.name)) ||
          !isLegacyChoiceItemEligible(current, row as Item5e, dependency)
        )
          continue
      } else if (
        !current.options.some(
          (v) =>
            legacyChoiceKey(v.name) === legacyChoiceKey(row.name) &&
            legacyChoiceKey(v.source) === legacyChoiceKey(row.source),
        ) ||
        !getRawFeatureTypes(row).some((v) => legacyChoiceKey(v) === 'fs:b')
      )
        continue
      const view = toView(current.kind === 'item' ? 'item' : 'optionalFeature', row, local)
      views.set(getClassChoiceOptionKey(view.reference), view)
    }
  }
  for (const row of saved)
    if (!views.has(getClassChoiceOptionKey(row)))
      views.set(getClassChoiceOptionKey(row), resolveExplicitOption(row, local, 'retained'))
  return [...views.values()].sort((a, b) => a.reference.name.localeCompare(b.reference.name))
}

/** Current family, exact printing, slot multiset and cross-pool ownership share one picker/projection policy. */
function resolvePsionicChoiceOptions(
  requested: NormalizedCharacterChoice,
  catalogs: ClassChoiceCatalogs,
  saved: readonly CharacterClassChoiceOption[],
  classLevel: number,
  character: Character | undefined,
): ClassChoiceOptionView[] {
  const relation = decodePsionicChoiceId(requested.id)
  const cls = catalogs.classes?.find(
    (row) =>
      normalized(row.name) === normalized(requested.owner.name) &&
      normalized(row.source) === normalized(requested.owner.source),
  )
  const sub = cls?.subclasses?.find(
    (row) =>
      normalized(row.name) === normalized(requested.owner.subclassName) &&
      normalized(row.source) === normalized(requested.owner.subclassSource),
  )
  const choice =
    cls &&
    normalizePsionicChoices(cls, sub, catalogs).choices.find((row) => row.id === requested.id)
  const current =
    relation &&
    choice &&
    JSON.stringify(choice) === JSON.stringify(requested) &&
    classLevel >= choice.level
  const other = new Set(
    (character?.classChoiceSelections ?? [])
      .filter(
        (row) =>
          row.choiceId !== requested.id &&
          getFeatureOwnerKey(row.className, row.classSource) ===
            getFeatureOwnerKey(requested.owner.name, requested.owner.source),
      )
      .flatMap((row) =>
        row.selected
          .filter((option) => option.entityType === 'psionic')
          .map(getClassChoiceOptionKey),
      ),
  )
  const views = new Map<string, ClassChoiceOptionView>()
  if (current)
    for (const row of catalogs.psionics ?? []) {
      const reference = { entityType: 'psionic' as const, name: row.name, source: row.source }
      const key = getClassChoiceOptionKey(reference)
      const prior = saved.find((option) => getClassChoiceOptionKey(option) === key)
      const eligible =
        !!resolvePsionic(reference, catalogs.psionics) &&
        choice.optionFilter?.psionicTypes?.includes(row.type) &&
        (!choice.optionFilter?.psionicOrders ||
          choice.optionFilter.psionicOrders.includes(row.order ?? '')) &&
        !other.has(key) &&
        (!prior || psionicSlotIsCurrent(choice, saved, prior.slotLevel, classLevel))
      if (eligible)
        views.set(key, {
          reference,
          availability: 'eligible',
          entries: getPsionicEntries(row),
          presentation: {
            kind: 'feature',
            featureTypeLabels: [
              row.type === 'T' ? 'Talent' : `${row.order ?? 'Unknown order'} discipline`,
            ],
          },
          searchText: `${row.name} ${row.order ?? ''}`,
        })
    }
  for (const reference of saved) {
    const key = getClassChoiceOptionKey(reference)
    if (!views.has(key)) views.set(key, { reference, availability: 'retained', entries: [] })
  }
  return [...views.values()]
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

function getCurrentLandTerrainSetup(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
  catalogs: Pick<ClassChoiceFeatureCatalogs, 'classes'> | undefined,
) {
  if (
    !subclass?.name ||
    !isCircleOfTheLand(cls.name ?? '', cls.source ?? '', subclass.name, subclass.source)
  )
    return undefined
  const owners = catalogs?.classes?.filter(
    (row) =>
      normalized(row.name) === normalized(cls.name) &&
      normalized(row.source) === normalized(cls.source),
  )
  const owner = owners?.length === 1 ? owners[0] : undefined
  const subclasses = owner?.subclasses?.filter(
    (row) =>
      normalized(row.name) === normalized(subclass.name) &&
      normalized(row.source) === normalized(subclass.source),
  )
  return owner && subclasses?.length === 1 ? getLandTerrainSetup(owner, subclasses[0]) : undefined
}

function getCurrentNamedSpellSetup(
  actor: { name?: string; source?: string },
  selection: { name?: string; source?: string } | undefined,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (
    !catalogs ||
    !selection ||
    isCircleOfTheLand(actor.name ?? '', actor.source ?? '', selection.name ?? '', selection.source)
  )
    return undefined
  const matches = catalogs.classes?.filter((row) => findClassReference(actor, [row]))
  if (matches?.length !== 1) return undefined
  const [cls] = matches
  const subclasses = cls.subclasses?.filter((row) => findClassReference(selection, [row]))
  if (subclasses?.length !== 1) return undefined
  const [subclass] = subclasses
  return getNamedSubclassSpellSetup(
    cls,
    subclass,
    scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source),
    ),
  )
}

/** Source-only candidates include both sides; no permission or character intent is inferred. */
export function getClassChoiceCandidates(
  classData: {
    name?: string
    source?: string
    classFeatureRefs?: Class5e['classFeatureRefs']
    classTableGroups?: Class5e['classTableGroups']
    normalizedRules?: { choices: NormalizedCharacterChoice[] }
  },
  subclass:
    | (Pick<Subclass5e, 'normalizedRules'> &
        Partial<Pick<Subclass5e, 'name' | 'source' | 'subclassFeatureRefs'>>)
    | undefined,
  catalogs?: ClassChoiceFeatureCatalogs,
): NormalizedCharacterChoice[] {
  const legacyFamily =
    classData.name && classData.source
      ? getLegacySubclassFamily(
          { name: classData.name, source: classData.source },
          subclass?.name && subclass.source
            ? { name: subclass.name, source: subclass.source }
            : undefined,
        )
      : undefined
  const legacy =
    legacyFamily &&
    classData.name &&
    classData.source &&
    catalogs &&
    subclass?.name &&
    subclass.source
      ? getLegacySubclassChoices(
          { name: classData.name, source: classData.source },
          { name: subclass.name, source: subclass.source },
          scopeClassChoiceFeatureCatalogs(
            catalogs,
            getFeatureOwnerKey(classData.name, classData.source, subclass.name, subclass.source),
          ),
        )
      : []
  const declarations = collectUnconditionalFeatureReferences(
    classData.classFeatureRefs ?? [],
    'classFeature',
  )
  const ordinary = getAllCharacterClassChoices(classData, subclass).filter((choice) => {
    if (choice.id === BLESSED_STRIKES_ID) return !!getCurrentBlessedStrikes(catalogs)
    if (choice.id === ELEMENTAL_FURY_ID)
      return !!getCurrentElementalFury(catalogs)?.hasAvailableOption
    if (
      legacyFamily &&
      choice.owner.type === 'subclass' &&
      ((legacyFamily === 'swords' &&
        choice.kind === 'optional-feature' &&
        (normalized(choice.owner.featureName) === 'fighting style' ||
          normalized(choice.label) === 'fighting style')) ||
        (legacyFamily === 'kensei' &&
          choice.kind === 'item' &&
          normalized(choice.owner.featureName) === 'path of the kensei'))
    )
      return false
    if (choice.kind === 'psionic' || choice.id.startsWith('psionic-choice:')) return false
    if (choice.kind === 'proficiency' || isClassProficiencyChoiceId(choice.id)) {
      return false
    }
    if (isFeatureLiteralChoiceId(choice.id)) {
      const enemy = decodeFavoredEnemyChoiceId(choice.id)
      if (enemy) return false
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
  const enemies =
    classData.name && classData.source
      ? normalizeFavoredEnemyChoices(
          { type: 'class', name: classData.name, source: classData.source },
          declarations,
          catalogs ?? { classFeatures: [] },
        ).choices
      : []
  return [
    ...ordinary,
    ...legacy,
    ...canonical,
    ...enemies,
    ...getRevisedHunterSetup(
      classData,
      subclass,
      catalogs &&
        scopeClassChoiceFeatureCatalogs(
          catalogs,
          getFeatureOwnerKey('Ranger', 'XPHB', 'Hunter', 'XPHB'),
        ),
    ).choices,
    ...getBarbarianPathSetup(classData, subclass, catalogs).choices,
    ...normalizePsionicChoices(classData, subclass, catalogs).choices,
    ...getWarlockPatronConfigurations(classData, subclass, catalogs?.classes),
    ...[
      getCurrentLandTerrainSetup(classData, subclass, catalogs),
      getCurrentNamedSpellSetup(classData, subclass, catalogs),
      getRevisedAffinitySetup(classData, subclass, catalogs),
      getDivineSoulConfiguration(classData, subclass, catalogs?.classes),
      getScionConfiguration(classData, subclass, catalogs?.classes),
      getArmorModelConfiguration(classData, subclass, catalogs?.classes),
    ].filter((row) => row !== undefined),
  ].sort((left, right) => left.level - right.level || left.id.localeCompare(right.id))
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
    classTableGroups?: Class5e['classTableGroups']
    normalizedRules?: { choiceDiagnostics: import('@/types/classRules').ClassChoiceDiagnostic[] }
  },
  subclass:
    | (Pick<Subclass5e, 'normalizedRules'> &
        Partial<Pick<Subclass5e, 'name' | 'source' | 'subclassFeatureRefs'>>)
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
  const keepNonPsionic = (row: import('@/types/classRules').ClassChoiceDiagnostic) =>
    !(
      normalized(row.className) === 'mystic' &&
      normalized(row.classSource) === normalized(PSIONIC_CLASS_SOURCE) &&
      ['Psionics', 'Bonus Disciplines', 'Order of the Soul Knife'].includes(row.featureName)
    )
  const classDiagnostics = (classData.normalizedRules?.choiceDiagnostics ?? []).filter(
    keepNonPsionic,
  )
  const subclassDiagnostics = (subclass?.normalizedRules?.choiceDiagnostics ?? []).filter(
    keepNonPsionic,
  )
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
  const enemyDiagnostics =
    classData.name && classData.source
      ? normalizeFavoredEnemyChoices(
          { type: 'class', name: classData.name, source: classData.source },
          collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
          catalogs ?? { classFeatures: [] },
        ).diagnostics
      : []
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
  const legacyOwner =
    classData.name && classData.source
      ? { name: classData.name, source: classData.source }
      : undefined
  const legacySub =
    subclass?.name && subclass.source ? { name: subclass.name, source: subclass.source } : undefined
  const legacyDiagnostics =
    legacyOwner &&
    legacySub &&
    getLegacySubclassFamily(legacyOwner, legacySub) &&
    !getLegacySubclassChoices(
      legacyOwner,
      legacySub,
      catalogs
        ? scopeClassChoiceFeatureCatalogs(
            catalogs as ClassChoiceFeatureCatalogs,
            getFeatureOwnerKey(
              legacyOwner.name,
              legacyOwner.source,
              legacySub.name,
              legacySub.source,
            ),
          )
        : {},
    ).length
      ? legacySubclassChoiceDiagnostic(legacyOwner, legacySub)
      : []
  return [
    ...legacyDiagnostics,
    ...normalizePsionicChoices(
      classData,
      subclass,
      catalogs as ClassChoiceFeatureCatalogs | undefined,
    ).diagnostics,
    ...getBarbarianPathSetup(
      classData,
      subclass,
      catalogs?.subclassFeatures
        ? { ...catalogs, subclassFeatures: catalogs.subclassFeatures }
        : undefined,
    ).diagnostics,
    ...getActiveRequiredSetupDiagnostics(
      enemyDiagnostics,
      classData,
      includeVariants,
      catalogs?.classFeatures,
      catalogs?.ambiguousClassFeatureTargets,
      catalogs?.classFeatureCandidates,
    ),
    ...classDiagnostics.filter(
      (diagnostic) =>
        !FAVORED_ENEMY_GRANTS.some(
          (g) =>
            diagnostic.featureName === 'Favored Enemy' &&
            diagnostic.requiredChoice &&
            getClassChoiceFeatureTarget(diagnostic.requiredChoice.target) === g.target,
        ) &&
        !(
          diagnostic.requiredChoice?.target.entityType === 'classFeature' &&
          getClassFeatureIdentity(
            decodeClassFeatureReference(diagnostic.requiredChoice.target.ref ?? ''),
          ) === DEFT_EXPLORER_TARGET
        ) &&
        includeDiagnostic(diagnostic, classDiagnostics),
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
  const rows: import('@/types/classRules').ClassChoiceDiagnostic[] = [
    ...getClassChoiceDiagnosticCandidateSide(classData, subclass, false, catalogs),
    ...getClassChoiceDiagnosticCandidateSide(classData, subclass, true, catalogs),
    ...getRevisedHunterSetup(
      classData,
      subclass,
      catalogs?.subclassFeatures &&
        scopeClassChoiceFeatureCatalogs(
          catalogs as ClassChoiceFeatureCatalogs,
          getFeatureOwnerKey('Ranger', 'XPHB', 'Hunter', 'XPHB'),
        ),
    ).diagnostics,
  ]
  if (
    subclass?.name &&
    isCircleOfTheLand(
      classData.name ?? '',
      classData.source ?? '',
      subclass.name,
      subclass.source,
    ) &&
    !getCurrentLandTerrainSetup(classData, subclass, catalogs)
  ) {
    rows.push({
      code: 'unverified-required-choice',
      className: 'Druid',
      classSource: classData.source ?? '',
      subclassName: subclass.name,
      subclassSource: subclass.source,
      level: normalized(classData.source) === 'phb' ? 2 : 3,
      featureName: 'Circle Spells',
      message: 'The exact Circle of the Land terrain rules are unavailable or unsupported.',
    })
  }
  if (
    isRevisedAffinityOwner(classData, subclass) &&
    !getRevisedAffinitySetup(
      classData,
      subclass,
      catalogs?.subclassFeatures ? (catalogs as ClassChoiceFeatureCatalogs) : undefined,
    )
  )
    rows.push(revisedAffinityDiagnostic)
  const patronConfigurations = getWarlockPatronConfigurationRules(classData, subclass)
  const divineSoul = getDivineSoulOwnerRule(classData, subclass)
  const scionGain = classData.classFeatureRefs?.find((row) => row.gainSubclassFeature)?.level
  if (
    scionGain &&
    isScionOwner(classData, subclass) &&
    !getScionConfiguration(classData, subclass, catalogs?.classes)
  )
    rows.push({
      code: 'unverified-required-choice',
      className: 'Rogue',
      classSource: 'XPHB',
      subclassName: 'Scion of the Three',
      subclassSource: 'FRHoF',
      level: scionGain,
      featureName: 'Dread Allegiance',
      message: 'Restore the exact Dread Allegiance feature and its matching cantrip schedule.',
    })
  if (divineSoul && !getDivineSoulConfiguration(classData, subclass, catalogs?.classes))
    rows.push({
      code: 'unverified-required-choice',
      className: divineSoul.owner.name,
      classSource: divineSoul.owner.source,
      subclassName: divineSoul.owner.subclassName,
      subclassSource: divineSoul.owner.subclassSource,
      level: divineSoul.level,
      featureName: 'Divine Soul Affinity',
      message: 'The exact Divine Soul affinity rules are unavailable or unsupported.',
    })
  if (patronConfigurations.length) {
    const current = getWarlockPatronConfigurations(classData, subclass, catalogs?.classes)
    for (const rule of patronConfigurations.filter(
      (rule) => !current.some(({ id }) => id === rule.id),
    )) {
      rows.push({
        code: 'unverified-required-choice',
        className: rule.owner.name,
        classSource: rule.owner.source,
        subclassName: rule.owner.subclassName,
        subclassSource: rule.owner.subclassSource,
        level: rule.level,
        featureName: rule.label,
        message: `The exact ${rule.label} rules are unavailable or unsupported.`,
      })
    }
  }
  if (
    catalogs &&
    normalized(classData.name) === 'cleric' &&
    normalized(classData.source) === 'xphb'
  ) {
    const blessed = getCurrentBlessedStrikes(catalogs)
    if (!blessed || !blessed.upgradeAvailable)
      rows.push({
        code: 'unverified-required-choice',
        className: 'Cleric',
        classSource: 'XPHB',
        level: blessed ? 14 : 7,
        featureName: blessed ? 'Improved Blessed Strikes' : 'Blessed Strikes',
        message: blessed
          ? 'Restore the exact Improved Blessed Strikes declaration to use the earned upgrade.'
          : 'Restore the exact revised Cleric source to choose a Blessed Strikes option.',
      })
  }
  if (
    catalogs &&
    normalized(classData.name) === 'druid' &&
    normalized(classData.source) === 'xphb' &&
    !getCurrentElementalFury(catalogs)?.hasAvailableOption
  ) {
    rows.push({
      code: 'unverified-required-choice',
      className: 'Druid',
      classSource: 'XPHB',
      level: ELEMENTAL_FURY_LEVEL,
      featureName: ELEMENTAL_FURY_NAME,
      message: 'Restore the exact Elemental Fury source to make this required choice.',
    })
  }
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
