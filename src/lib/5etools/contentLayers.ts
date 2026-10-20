import {
  getClassChoiceFeatureTarget,
  getFeatureOwnerKey,
} from '@/lib/character/classChoiceIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  resolveFeatureOptionEntity,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import { hasProficiencyCatalogTarget } from '@/lib/character/classProficiencyOptions'
import { collectRevisedSourceAbbreviations } from '@/lib/sourceCompatibility'
import type {
  Class5e,
  GameData,
  GameDataSourceStack,
  ItemEntry5e,
  SubclassFeature,
} from '@/types/5etools'
import { normalizeSubclassRules } from './classChoiceNormalization'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { normalizeClassRules } from './classRuleNormalization'
import { auditConditionalOptionalLayerMultiplicity } from './conditionalProficiencySource'
import { CopyResolutionError, resolveCopiedRecords } from './copyResolution'
import type { DataLoaderOptions } from './dataLoader'
import {
  getLoadedCreatureTemplates,
  getLoadedRaceData,
  loadDataFromSource,
  setLoadedRaceData,
} from './dataLoader'
import { mergeFixedShieldBases } from './fixedBonusShields'
import {
  auditFixedLayerMultiplicity,
  auditProficiencySubclassLayerMultiplicity,
} from './fixedProficiencySource'
import {
  expandItemEntries,
  getItemEntryIdentity,
  getRawItems,
  hasRetainedRawItems,
  retainRawItems,
} from './itemEntries'
import {
  associateItemTypeEntries,
  getItemTypeEntrySources,
  mergeItemTypeEntries,
} from './itemTypeEntries'
import { buildGameDataLookups } from './lookups'
import { appendMagicVariantReferences, mergeMagicVariants } from './magicVariants'
import { mergeOptionalClassFeatureSources } from './optionalClassFeatureSource'
import { mergeOptionalClassSections } from './optionalClassSectionSource'
import { buildSourcesList } from './parsers/basic'
import { parseRaces } from './parsers/races'
import {
  associatePrimaryItemTypes,
  getRawItemTypes,
  mergePrimaryItemTypes,
  resolvePrimaryItemTypes,
} from './primaryItemTypes'
import { auditSpellRouteMultiplicity } from './spellRouteSources'
import { getSubclassIntroEntries } from './subclassContent'
import { collectLayerSubclassFeatures as collectSubclassFeatures } from './subclassFeatureCatalog'
import {
  auditToolLayerMultiplicity,
  prepareToolProficiencySources,
  preserveToolSourcePresentation,
  restoreToolSourceInput,
} from './toolProficiencySource'

type GameDataCollectionKey = Exclude<keyof GameData, 'lookups'>

function normalizeIdentityPart(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function recordIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `value:${JSON.stringify(value)}`
  }

  const record = value as Record<string, unknown>
  const name = normalizeIdentityPart(record.name)
  const source = normalizeIdentityPart(record.source)
  if (name) {
    return `entity:${name}|${source}|${normalizeIdentityPart(record._sourceType)}`
  }

  const abbreviation = normalizeIdentityPart(record.abbreviation)
  if (abbreviation) return `abbreviation:${abbreviation}|${source}`

  if (source) return `entity:|${source}|${normalizeIdentityPart(record._sourceType)}`

  const id = normalizeIdentityPart(record.id)
  if (id) return `id:${id}|${source}`

  return `record:${JSON.stringify(record)}`
}

function classFeatureIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  const record = value as Record<string, unknown>
  const identity = getClassFeatureIdentity(record)
  if (identity) return identity
  // Incomplete rows retain their structural overlay identity.
  return [
    'opaque-class-feature',
    normalizeIdentityPart(record.name),
    normalizeIdentityPart(record.source),
    normalizeIdentityPart(record.className),
    normalizeIdentityPart(record.classSource),
    typeof record.level === 'number' ? String(record.level) : '',
  ].join('|')
}

function sourceIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  return `source:${normalizeIdentityPart((value as Record<string, unknown>).abbreviation)}`
}

function itemPropertyIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  const record = value as Record<string, unknown>
  const abbreviation = normalizeIdentityPart(record.abbreviation)
  if (!abbreviation) return recordIdentity(value)
  return `item-property:${abbreviation}|${normalizeIdentityPart(record.source)}`
}

function subraceIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  const record = value as Record<string, unknown>
  const copy = record._copy as Record<string, unknown> | undefined
  return [
    record.name,
    record.source,
    record.raceName ?? copy?.raceName,
    record.raceSource ?? copy?.raceSource,
  ]
    .map(normalizeIdentityPart)
    .join('|')
}

function mergeCollection<T>(
  base: readonly T[],
  overlay: readonly T[],
  getIdentity: (value: T) => string = recordIdentity,
): T[] {
  const merged = new Map<string, T>()
  for (const value of base) merged.set(getIdentity(value), value)
  for (const value of overlay) merged.set(getIdentity(value), value)
  return [...merged.values()]
}

function groupSubclassFeaturesByLevel(
  references: NonNullable<NonNullable<Class5e['subclasses']>[number]['subclassFeatureRefs']>,
): Array<{ level: number; features: SubclassFeature[] }> {
  const groups = new Map<number, SubclassFeature[]>()
  for (const reference of references) {
    if (!reference.feature) continue
    const level = reference.feature.level ?? reference.level
    if (level === undefined) continue
    const features = groups.get(level) ?? []
    features.push(reference.feature)
    groups.set(level, features)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([level, features]) => ({ level, features }))
}

function resolveComposedFeatureReferences(gameData: GameData, layers: readonly GameData[]): void {
  const features = new Map(
    gameData.classFeatures.map((feature) => [classFeatureIdentity(feature), feature]),
  )
  const subclassFeatures = collectSubclassFeatures(layers)

  gameData.classes = gameData.classes.map((classData) => {
    let changed = false
    const classFeatureRefs = (classData.classFeatureRefs ?? []).map((reference) => {
      const identity = getClassFeatureIdentity(reference)
      const feature = identity ? features.get(identity) : undefined
      if (reference.feature === feature) return reference
      changed = true
      return { ...reference, feature }
    })

    const subclasses = (classData.subclasses ?? []).map((subclass) => {
      let subclassChanged = false
      const subclassFeatureRefs = (subclass.subclassFeatureRefs ?? []).map((reference) => {
        const identity = getSubclassFeatureIdentity(reference)
        const feature = identity ? subclassFeatures.get(identity) : undefined
        if (!feature || reference.feature === feature) return reference
        subclassChanged = true
        return { ...reference, feature }
      })
      if (!subclassChanged) return subclass
      changed = true
      return {
        ...subclass,
        subclassFeatureRefs,
        entries: getSubclassIntroEntries(subclass, subclassFeatureRefs),
        levelFeatures: groupSubclassFeaturesByLevel(subclassFeatureRefs),
        normalizedRules: normalizeSubclassRules(classData, subclass, subclassFeatureRefs),
      }
    })

    if (!changed) return classData
    const resolved = { ...classData, classFeatureRefs, subclasses }
    return {
      ...resolved,
      normalizedRules: normalizeClassRules(resolved, classFeatureRefs),
    }
  })
}

export interface ContentLayerDependencyIssue {
  owner: string
  path: string
  reference: string
  /** Item choices retain descriptive references without materializing inventory or effects. */
  required?: boolean
}

export interface DataSourceStackLoaderOptions extends DataLoaderOptions {
  onLayerLoaded?: (role: 'base' | 'additional', data: GameData) => void
}

function entityKey(name: unknown, source: unknown): string {
  return `${normalizeIdentityPart(name)}|${normalizeIdentityPart(source)}`
}

/** Find hard references introduced by a layer that the completed catalog cannot satisfy. */
export function findLayerDependencyIssues(
  gameData: GameData,
  layer: GameData,
): ContentLayerDependencyIssue[] {
  const layerClasses = new Set(layer.classes.map((value) => entityKey(value.name, value.source)))
  const issues: ContentLayerDependencyIssue[] = []
  const featureCatalogs = buildClassChoiceFeatureCatalogs(gameData)
  const optionCatalogs = {
    classFeature: new Set(gameData.classFeatures.map(getClassFeatureIdentity)),
    subclassFeature: new Set(
      [...collectSubclassFeatures([gameData]).values()].map(getSubclassFeatureIdentity),
    ),
    creature: new Set(
      (gameData.creatures ?? []).map((value) => entityKey(value.name, value.source)),
    ),
    feat: new Set(gameData.feats.map((value) => entityKey(value.name, value.source))),
    item: new Set(
      [...gameData.items, ...gameData.itemsBase].map((value) =>
        entityKey(value.name, value.source),
      ),
    ),
    optionalFeature: new Set(
      gameData.optionalfeatures.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const record = value as Record<string, unknown>
        return [entityKey(record.name, record.source)]
      }),
    ),
  }

  for (const classData of gameData.classes) {
    if (!layerClasses.has(entityKey(classData.name, classData.source))) continue
    const owner = `${classData.name}|${classData.source}`
    for (const [index, reference] of (classData.classFeatureRefs ?? []).entries()) {
      if (reference.feature) continue
      issues.push({
        owner,
        path: `classFeatureRefs[${index}]`,
        reference: reference.ref || `${reference.name}|${reference.source ?? ''}`,
      })
    }
    for (const [subclassIndex, subclass] of (classData.subclasses ?? []).entries()) {
      for (const [referenceIndex, reference] of (subclass.subclassFeatureRefs ?? []).entries()) {
        if (reference.feature) continue
        issues.push({
          owner: `${owner}/${subclass.name}|${subclass.source}`,
          path: `subclasses[${subclassIndex}].subclassFeatureRefs[${referenceIndex}]`,
          reference: reference.ref || `${reference.name}|${reference.source ?? ''}`,
        })
      }
    }
    for (const [choiceIndex, choice] of (classData.normalizedRules?.choices ?? []).entries()) {
      for (const [optionIndex, option] of choice.options.entries()) {
        if (option.entityType === 'proficiency') {
          if (!hasProficiencyCatalogTarget(option, featureCatalogs))
            issues.push({
              owner,
              path: `normalizedRules.choices[${choiceIndex}].options[${optionIndex}]`,
              reference: option.ref ?? option.name,
            })
          continue
        }
        const reference = option.ref ?? `${option.name}|${option.source ?? ''}`
        const featureOption =
          option.entityType === 'classFeature' || option.entityType === 'subclassFeature'
        const key = featureOption
          ? getClassChoiceFeatureTarget(option)
          : entityKey(option.name, option.source)
        if (
          option.entityType === 'featureOption'
            ? resolveFeatureOptionEntity(
                option,
                scopeClassChoiceFeatureCatalogs(
                  featureCatalogs,
                  choice.owner.type === 'subclass'
                    ? getFeatureOwnerKey(
                        choice.owner.name,
                        choice.owner.source,
                        choice.owner.subclassName,
                        choice.owner.subclassSource,
                      )
                    : undefined,
                ),
              )
            : (featureOption || option.source?.trim()) &&
              key &&
              optionCatalogs[option.entityType].has(key)
        ) {
          continue
        }
        issues.push({
          owner,
          path: `normalizedRules.choices[${choiceIndex}].options[${optionIndex}]`,
          reference,
          ...(option.entityType === 'item' ? { required: false } : {}),
        })
      }
    }
    for (const [subclassIndex, subclass] of (classData.subclasses ?? []).entries()) {
      for (const [choiceIndex, choice] of (subclass.normalizedRules?.choices ?? []).entries()) {
        for (const [optionIndex, option] of choice.options.entries()) {
          if (option.entityType === 'proficiency') {
            if (!hasProficiencyCatalogTarget(option, featureCatalogs))
              issues.push({
                owner: `${owner}/${subclass.name}|${subclass.source}`,
                path: `subclasses[${subclassIndex}].normalizedRules.choices[${choiceIndex}].options[${optionIndex}]`,
                reference: option.ref ?? option.name,
              })
            continue
          }
          const reference = option.ref ?? `${option.name}|${option.source ?? ''}`
          const featureOption =
            option.entityType === 'classFeature' || option.entityType === 'subclassFeature'
          const key = featureOption
            ? getClassChoiceFeatureTarget(option)
            : entityKey(option.name, option.source)
          if (
            option.entityType === 'featureOption'
              ? resolveFeatureOptionEntity(
                  option,
                  scopeClassChoiceFeatureCatalogs(
                    featureCatalogs,
                    choice.owner.type === 'subclass'
                      ? getFeatureOwnerKey(
                          choice.owner.name,
                          choice.owner.source,
                          choice.owner.subclassName,
                          choice.owner.subclassSource,
                        )
                      : undefined,
                  ),
                )
              : (featureOption || option.source?.trim()) &&
                key &&
                optionCatalogs[option.entityType].has(key)
          ) {
            continue
          }
          issues.push({
            owner: `${owner}/${subclass.name}|${subclass.source}`,
            path: `subclasses[${subclassIndex}].normalizedRules.choices[${choiceIndex}].options[${optionIndex}]`,
            reference,
            ...(option.entityType === 'item' ? { required: false } : {}),
          })
        }
      }
    }
  }

  return issues
}

const COLLECTION_IDENTITIES: Partial<Record<GameDataCollectionKey, (value: never) => string>> = {
  classFeatures: classFeatureIdentity,
  itemProperties: itemPropertyIdentity,
  sources: sourceIdentity,
}

/**
 * Compose already-parsed catalogs by canonical entity identity. Later layers replace exact
 * matches while base entities omitted by an overlay remain available.
 */
export function composeGameDataLayers(layers: readonly GameData[]): GameData {
  if (layers.length === 0) {
    throw new Error('At least one parsed game-data layer is required')
  }

  const collectionKeys = [...new Set(layers.flatMap((layer) => Object.keys(layer)))].filter(
    (key): key is GameDataCollectionKey => key !== 'lookups',
  )
  const composed = {} as GameData
  const classLayers = new Map(
    layers.map((layer) => [layer, auditProficiencySubclassLayerMultiplicity(layer.classes)]),
  )
  const toolRawLayers = new Map(
    layers.map((layer) => {
      const original = getRawItems(layer)
      const raw = hasRetainedRawItems(layer)
        ? original
        : {
            items: original.items.map(restoreToolSourceInput),
            itemsBase: original.itemsBase.map(restoreToolSourceInput),
          }
      const audited = auditToolLayerMultiplicity([...raw.items, ...raw.itemsBase])
      return [
        layer,
        { items: audited.slice(0, raw.items.length), itemsBase: audited.slice(raw.items.length) },
      ] as const
    }),
  )

  for (const key of collectionKeys) {
    if (key === 'optionalClassSections') {
      composed.optionalClassSections = mergeOptionalClassSections(layers)
      continue
    }
    if (key === 'optionalClassFeatureSources') {
      composed.optionalClassFeatureSources = mergeOptionalClassFeatureSources(layers)
      continue
    }
    if (key === 'magicVariants') {
      composed.magicVariants = mergeMagicVariants(layers.map((layer) => layer.magicVariants ?? []))
      continue
    }
    if (
      key === 'magicVariantDiagnostics' ||
      key === 'fixedShieldBases' ||
      key === 'fixedShieldDiagnostics'
    )
      continue
    if (key === 'itemTypes') {
      composed.itemTypes = mergePrimaryItemTypes(layers.map(getRawItemTypes))
      continue
    }
    if (key === 'itemTypeAdditionalEntries') {
      composed.itemTypeAdditionalEntries = mergeItemTypeEntries(
        layers.map((layer) => layer.itemTypeAdditionalEntries ?? []),
      )
      continue
    }
    if (key === 'itemEntries') {
      // A later layer replaces an identity, but duplicates within that winning layer
      // remain ambiguous; do not erase an optional-text diagnostic by picking one.
      composed.itemEntries = layers.reduce<ItemEntry5e[]>((merged, layer) => {
        const entries = layer.itemEntries ?? []
        const replaced = new Set(
          entries.map((entry) => getItemEntryIdentity(entry.name, entry.source)),
        )
        return [
          ...merged.filter(
            (entry) => !replaced.has(getItemEntryIdentity(entry.name, entry.source)),
          ),
          ...entries,
        ]
      }, [])
      continue
    }
    const getIdentity = COLLECTION_IDENTITIES[key] ?? recordIdentity
    const values = layers.reduce<unknown[]>((merged, layer) => {
      const layerValues = ((key === 'classes'
        ? classLayers.get(layer)
        : key === 'items' || key === 'itemsBase'
          ? toolRawLayers.get(layer)?.[key]
          : layer[key]) ?? []) as unknown[]
      const audited =
        key === 'classes' || key === 'classFeatures'
          ? auditFixedLayerMultiplicity(layerValues as object[], key)
          : key === 'optionalfeatures'
            ? auditConditionalOptionalLayerMultiplicity(layerValues)
            : key === 'spells'
              ? auditSpellRouteMultiplicity(layerValues as GameData['spells'], 'spell-layer')
              : layerValues
      return mergeCollection(merged, audited, getIdentity as (value: unknown) => string)
    }, [])
    ;(composed as unknown as Record<GameDataCollectionKey, unknown>)[key] = values
  }

  resolveComposedFeatureReferences(
    composed,
    layers.map((layer) => ({ ...layer, classes: classLayers.get(layer)! })),
  )
  // Race copies and versions must see the winning raw parents, including already-resolved copies.
  const rawRaces = layers.map(getLoadedRaceData).reduce(
    (merged, layer) => ({
      race: mergeCollection(merged.race, layer.race),
      subrace: mergeCollection(merged.subrace, layer.subrace, subraceIdentity),
    }),
    { race: [] as unknown[], subrace: [] as unknown[] },
  )
  setLoadedRaceData(composed, rawRaces)
  composed.races = parseRaces(rawRaces) as GameData['races']
  const knownSources = new Set(
    composed.sources.map((source) => normalizeIdentityPart(source.abbreviation)),
  )
  const addedSources = [
    ...new Set(
      composed.races
        .flatMap((race) => [race, ...(race.subraces ?? [])])
        .map((race) => race.source)
        .concat(getItemTypeEntrySources(composed.itemTypeAdditionalEntries ?? []))
        .filter((source) => source && !knownSources.has(normalizeIdentityPart(source))),
    ),
  ]
  composed.sources.push(
    ...buildSourcesList(
      addedSources,
      undefined,
      undefined,
      collectRevisedSourceAbbreviations(composed),
    ),
  )
  composed.fixedShieldBases = mergeFixedShieldBases(layers)
  const concreteItemCount = composed.items.length
  retainRawItems(composed)
  const rawToolInputs = [...composed.items, ...composed.itemsBase]
  const items = resolveCopiedRecords(rawToolInputs, 'item')
  const toolAuditedItems = prepareToolProficiencySources(rawToolInputs, items.records)
  composed.items = toolAuditedItems.slice(0, concreteItemCount)
  composed.itemsBase = toolAuditedItems.slice(concreteItemCount)
  appendMagicVariantReferences(composed)
  const referenceSources = new Set(
    composed.sources.map((source) => normalizeIdentityPart(source.abbreviation)),
  )
  const newReferenceSources = [
    ...new Set(
      composed.items
        .filter((item) => item.magicVariantReference)
        .map((item) => item.source)
        .filter((source) => !referenceSources.has(normalizeIdentityPart(source))),
    ),
  ]
  composed.sources.push(
    ...buildSourcesList(
      newReferenceSources,
      undefined,
      undefined,
      collectRevisedSourceAbbreviations(composed),
    ),
  )
  const itemCount = composed.items.length
  resolvePrimaryItemTypes(composed)
  const beforeToolPresentation = [...composed.items, ...composed.itemsBase]
  const describedItems = preserveToolSourcePresentation(
    beforeToolPresentation,
    associateItemTypeEntries(
      associatePrimaryItemTypes(
        expandItemEntries(beforeToolPresentation, composed.itemEntries ?? []),
        composed.itemTypes,
        composed.itemEntries ?? [],
      ),
      composed.itemTypeAdditionalEntries ?? [],
      composed.itemEntries ?? [],
    ),
  )
  composed.items = describedItems.slice(0, itemCount)
  composed.itemsBase = describedItems.slice(itemCount)
  const templates = layers.flatMap(getLoadedCreatureTemplates)
  const creatures = resolveCopiedRecords(composed.creatures ?? [], 'monster', templates)
  composed.creatures = creatures.records
  const copyDiagnostics = [...items.diagnostics, ...creatures.diagnostics]
  if (copyDiagnostics.length > 0) {
    throw new CopyResolutionError(copyDiagnostics, 'after content layering')
  }
  composed.lookups = buildGameDataLookups(composed)
  return composed
}

function optionsForLayer(
  options: DataLoaderOptions | undefined,
  label: string,
  deferCopyResolutionErrors = false,
): DataLoaderOptions | undefined {
  if (!options) return deferCopyResolutionErrors ? { deferCopyResolutionErrors } : undefined
  return {
    ...options,
    deferCopyResolutionErrors,
    onProgress: options.onProgress
      ? (current, total, resource) => {
          options.onProgress?.(current, total, `${label}: ${resource}`)
        }
      : undefined,
    onResourceFailure: options.onResourceFailure
      ? (resource, failure) => options.onResourceFailure?.(`${label}: ${resource}`, failure)
      : undefined,
  }
}

/** Load every configured source independently, then compose their normalized results. */
export async function loadGameDataSourceStack(
  stack: GameDataSourceStack,
  options?: DataSourceStackLoaderOptions,
): Promise<GameData> {
  const base = await loadDataFromSource(
    stack.base,
    optionsForLayer(options, 'Included SRD', Boolean(stack.additional)),
  )
  options?.onLayerLoaded?.('base', base)
  if (!stack.additional) return base

  const additional = await loadDataFromSource(
    stack.additional,
    optionsForLayer(options, 'Additional content', true),
  )
  options?.onLayerLoaded?.('additional', additional)
  let composed: GameData
  try {
    composed = composeGameDataLayers([base, additional])
  } catch (error) {
    if (error instanceof CopyResolutionError) {
      for (const diagnostic of error.diagnostics) {
        options?.onResourceFailure?.(`Copied entity: ${diagnostic.entity}`, { required: true })
      }
    }
    throw error
  }
  // Optional item-choice metadata stays diagnostic; reporting a transport failure would
  // incorrectly hold every background refresh on the previous cache.
  const dependencyIssues = findLayerDependencyIssues(composed, additional).filter(
    (issue) => issue.required !== false,
  )
  if (dependencyIssues.length > 0) {
    for (const issue of dependencyIssues) {
      options?.onResourceFailure?.(`Additional content: ${issue.reference}`, { required: true })
    }
    const firstIssue = dependencyIssues[0]
    throw new Error(
      `Additional content has ${dependencyIssues.length} unresolved required ${dependencyIssues.length === 1 ? 'reference' : 'references'}. ${firstIssue.owner} needs ${firstIssue.reference}.`,
    )
  }
  return composed
}
