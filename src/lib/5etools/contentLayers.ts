import type { GameData, GameDataSourceStack } from '@/types/5etools'
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

function resolveComposedClassFeatureReferences(gameData: GameData): void {
  const features = new Map(
    gameData.classFeatures.map((feature) => [classFeatureIdentity(feature), feature]),
  )

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

    if (!changed) return classData
    const resolved = { ...classData, classFeatureRefs }
    return {
      ...resolved,
      normalizedRules: normalizeClassRules(resolved, classFeatureRefs),
    }
  })
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

  resolveComposedClassFeatureReferences(composed)
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
  options?: DataLoaderOptions,
): Promise<GameData> {
  const base = await loadDataFromSource(stack.base, optionsForLayer(options, 'Included SRD'))
  if (!stack.additional) return base

  const additional = await loadDataFromSource(
    stack.additional,
    optionsForLayer(options, 'Additional content'),
  )
  return composeGameDataLayers([base, additional])
}
