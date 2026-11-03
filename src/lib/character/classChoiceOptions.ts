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
import { isValidKenseiSelection } from '@/lib/schema/legacySubclassChoiceValidation'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import {
  getCreatureTypes,
  getItemPropertyReferences,
  matchesClassChoiceFilter,
} from './classChoiceFilters'

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
  getClassFeatureSpellSemantics,
  hasDeclaredClassFeatSpellContext,
} from '@/lib/5etools/featureSpellSemantics'
import {
  type FeatureTableDefinition,
  type FeatureTableOption,
  resolveFeatureTableOption,
} from '@/lib/5etools/featureTableOptions'
import { getItemPropertyLabel } from '@/lib/5etools/itemProperties'
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
    Pick<ClassChoiceFeatureCatalogs, 'subclassFeatureCandidates' | 'psionics'>,
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
  if (target?.format === 'source-group')
    return (
      resolveNaturalExplorerOption(option, catalogs) ?? resolveFavoredEnemyOption(option, catalogs)
    )
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
    return {
      availability,
      reference: option,
      entries: match.entries ?? [],
      presentation: {
        kind: 'feature',
        featureTypeLabels: [
          'group' in match
            ? isFavoredEnemyOption(option)
              ? 'Favored enemy'
              : 'Favored terrain'
            : 'Dragon ancestry',
        ],
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
          matchesClassChoiceFilter(
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
      .map((option) => {
        if (
          !choice.source.field.endsWith(':entries.filter-alternative-v1') ||
          option.reference.entityType !== 'feat' ||
          !getClassFeatureSpellSemantics(
            'feat',
            option.reference.name,
            option.reference.source ?? '',
          )
        )
          return option
        const candidates = catalogs.feats.filter(
          (feat) =>
            normalized(feat.name) === normalized(option.reference.name) &&
            normalized(feat.source) === normalized(option.reference.source),
        )
        return candidates.length === 1 && hasDeclaredClassFeatSpellContext(choice, candidates[0])
          ? { ...option, prerequisite: undefined }
          : { ...option, availability: 'retained' as const }
      })
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
      byKey.set(
        key,
        resolveExplicitOption(option, catalogs, enemy ? 'eligible' : 'retained', tableDefinitions),
      )
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
    ...normalizePsionicChoices(classData, subclass, catalogs).choices,
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
