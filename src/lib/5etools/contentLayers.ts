import type { Class5e, GameData, GameDataSourceStack, SubclassFeature } from '@/types/5etools'
import { normalizeClassRules } from './classRuleNormalization'
import type { DataLoaderOptions } from './dataLoader'
import { loadDataFromSource } from './dataLoader'
import { buildGameDataLookups } from './lookups'

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
  if (name || source) {
    return `entity:${name}|${source}|${normalizeIdentityPart(record._sourceType)}`
  }

  const abbreviation = normalizeIdentityPart(record.abbreviation)
  if (abbreviation) return `abbreviation:${abbreviation}|${source}`

  const id = normalizeIdentityPart(record.id)
  if (id) return `id:${id}|${source}`

  return `record:${JSON.stringify(record)}`
}

function classFeatureIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  const record = value as Record<string, unknown>
  return [
    'class-feature',
    normalizeIdentityPart(record.name),
    normalizeIdentityPart(record.source),
    normalizeIdentityPart(record.className),
    normalizeIdentityPart(record.classSource),
    typeof record.level === 'number' ? String(record.level) : '',
  ].join('|')
}

function subclassFeatureIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  const record = value as Record<string, unknown>
  return [
    'subclass-feature',
    normalizeIdentityPart(record.name),
    normalizeIdentityPart(record.source),
    normalizeIdentityPart(record.className),
    normalizeIdentityPart(record.classSource),
    normalizeIdentityPart(record.subclassShortName),
    normalizeIdentityPart(record.subclassSource),
    typeof record.level === 'number' ? String(record.level) : '',
  ].join('|')
}

function sourceIdentity(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordIdentity(value)
  return `source:${normalizeIdentityPart((value as Record<string, unknown>).abbreviation)}`
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

function collectSubclassFeatures(layers: readonly GameData[]): Map<string, SubclassFeature> {
  const features = new Map<string, SubclassFeature>()
  for (const layer of layers) {
    for (const classData of layer.classes) {
      for (const subclass of classData.subclasses ?? []) {
        for (const reference of subclass.subclassFeatureRefs ?? []) {
          if (reference.feature) {
            features.set(subclassFeatureIdentity(reference.feature), reference.feature)
          }
        }
        for (const feature of subclass.subclassFeatures ?? []) {
          if (typeof feature === 'object') {
            features.set(subclassFeatureIdentity(feature), feature)
          }
        }
        for (const group of subclass.levelFeatures ?? []) {
          for (const feature of group.features) {
            features.set(subclassFeatureIdentity(feature), feature)
          }
        }
      }
    }
  }
  return features
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
      const feature = features.get(
        classFeatureIdentity({
          name: reference.name,
          source: reference.source ?? reference.classSource ?? classData.source,
          className: reference.className || classData.name,
          classSource: reference.classSource ?? classData.source,
          level: reference.level,
        }),
      )
      if (!feature || reference.feature === feature) return reference
      changed = true
      return { ...reference, feature }
    })

    const subclasses = (classData.subclasses ?? []).map((subclass) => {
      let subclassChanged = false
      const subclassFeatureRefs = (subclass.subclassFeatureRefs ?? []).map((reference) => {
        const feature = subclassFeatures.get(
          subclassFeatureIdentity({
            name: reference.name,
            source: reference.source ?? reference.subclassSource ?? subclass.source,
            className: reference.className || classData.name,
            classSource: reference.classSource ?? subclass.classSource ?? classData.source,
            subclassShortName: reference.subclassShortName || subclass.shortName,
            subclassSource: reference.subclassSource ?? subclass.source,
            level: reference.level,
          }),
        )
        if (!feature || reference.feature === feature) return reference
        subclassChanged = true
        return { ...reference, feature }
      })
      if (!subclassChanged) return subclass
      changed = true
      return {
        ...subclass,
        subclassFeatureRefs,
        levelFeatures: groupSubclassFeaturesByLevel(subclassFeatureRefs),
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
  const optionCatalogs = {
    classFeature: new Set(
      gameData.classFeatures.map((value) => entityKey(value.name, value.source)),
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
        const reference = `${option.name}|${option.source ?? ''}`
        if (
          option.source &&
          optionCatalogs[option.entityType].has(entityKey(option.name, option.source))
        ) {
          continue
        }
        issues.push({
          owner,
          path: `normalizedRules.choices[${choiceIndex}].options[${optionIndex}]`,
          reference,
        })
      }
    }
  }

  return issues
}

const COLLECTION_IDENTITIES: Partial<Record<GameDataCollectionKey, (value: never) => string>> = {
  classFeatures: classFeatureIdentity,
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

  for (const key of collectionKeys) {
    const getIdentity = COLLECTION_IDENTITIES[key] ?? recordIdentity
    const values = layers.reduce<unknown[]>(
      (merged, layer) =>
        mergeCollection(
          merged,
          (layer[key] ?? []) as unknown[],
          getIdentity as (value: unknown) => string,
        ),
      [],
    )
    ;(composed as unknown as Record<GameDataCollectionKey, unknown>)[key] = values
  }

  resolveComposedFeatureReferences(composed, layers)
  composed.lookups = buildGameDataLookups(composed)
  return composed
}

function optionsForLayer(
  options: DataLoaderOptions | undefined,
  label: string,
): DataLoaderOptions | undefined {
  if (!options) return undefined
  return {
    ...options,
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
  const base = await loadDataFromSource(stack.base, optionsForLayer(options, 'Included SRD'))
  options?.onLayerLoaded?.('base', base)
  if (!stack.additional) return base

  const additional = await loadDataFromSource(
    stack.additional,
    optionsForLayer(options, 'Additional content'),
  )
  options?.onLayerLoaded?.('additional', additional)
  const composed = composeGameDataLayers([base, additional])
  const dependencyIssues = findLayerDependencyIssues(composed, additional)
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
